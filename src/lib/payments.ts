/* Payments go through DivinityCoin only (src/lib/divinitycoin.ts). A
   transaction row is our "order": created pending, paid via an embedded
   hosted checkout on /checkout/<txId>, settled by the webhook or the frame's
   confirm call. "comp" settles without a charge (zero-amount after credit, or
   an admin action). */
import { and, eq, sql } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/lib/db";
import { divinitycoin, cleanOrigin, type CustomerOrigin } from "@/lib/divinitycoin";
import { settle, type Tx, getBooth } from "@/lib/economy";
import { bumpSiteDaily } from "@/lib/analytics";
import { getSettings, flag } from "@/lib/settings";
import { now } from "@/lib/util";
import { TIERS, type Tier } from "@/lib/config";

export async function paymentsMode(): Promise<"divinitycoin" | "test" | "unconfigured"> {
  const s = await getSettings(["DIVINITYCOIN_API_KEY", "DIVINITYCOIN_TEST_MODE"]);
  if (flag(s.DIVINITYCOIN_TEST_MODE)) return "test";
  return s.DIVINITYCOIN_API_KEY ? "divinitycoin" : "unconfigured";
}

/** Where the buyer goes next after a transaction row exists: our checkout page (or straight to done when nothing is owed). */
export async function nextStepUrl(tx: Tx): Promise<string> {
  const site = (await getSettings(["SITE_URL"])).SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  if (tx.amountCents <= 0) {
    await settle(tx.id, "comp", "credit");
    return `${site}/app/checkout/done?tx=${tx.id}`;
  }
  return `${site}/app/checkout/${tx.id}`;
}

export function describeTx(tx: Tx): string {
  const meta = tx.meta ? (JSON.parse(tx.meta) as { tier?: Tier; coins?: number; draft?: { name?: string } }) : {};
  switch (tx.kind) {
    case "claim": return `Claim Booth #${tx.boothId}${meta.draft?.name ? ` · ${meta.draft.name}` : ""}`;
    case "takeover": return `Take over Booth #${tx.boothId}`;
    case "boost": return `Boost Booth #${tx.boothId}`;
    case "book": { const q = Number((meta as { qty?: number }).qty) || 1; return `Display ${q} ${q === 1 ? "book" : "books"} at Booth #${tx.boothId}`; }
    case "banner": return `${(meta as { height?: number }).height ?? ""} ft banner for Booth #${tx.boothId}`;
    case "tier": return `${TIERS[meta.tier ?? "pro"].name} plan for Booth #${tx.boothId} (30 days)`;
    case "coins": return `${meta.coins ?? ""} arcade coins`;
    case "billboard": return `Billboard campaign`;
    default: return tx.kind;
  }
}

/**
 * Start (or restart) the DivinityCoin hosted checkout for a pending
 * transaction. Payment kinds use a payment-mode session; the "tier" kind
 * uses a setup-mode session that saves the card, after which we charge the
 * first period ourselves (see subscriptions.ts).
 */
export async function startCheckout(txId: string, opts: { embed?: boolean; origin?: CustomerOrigin | null } = {}): Promise<{ url: string; sessionId: string | null; mode: "payment" | "setup" }> {
  await ensureMigrated();
  const [tx] = await db.select().from(schema.transactions).where(eq(schema.transactions.id, txId)).limit(1);
  if (!tx) throw new Error("Transaction not found.");
  if (tx.status === "paid") throw new Error("This transaction is already paid.");
  if (tx.status !== "pending") throw new Error(`This transaction is ${tx.status}.`);
  const [buyer] = tx.buyerId ? await db.select().from(schema.users).where(eq(schema.users.id, tx.buyerId)).limit(1) : [];
  if (!buyer) throw new Error("Buyer not found.");
  const s = await getSettings(["SITE_URL", "SITE_NAME", "MAINTENANCE_MODE"]);
  if (flag(s.MAINTENANCE_MODE)) throw new Error("Checkout is paused for maintenance. Try again shortly.");
  const base = (s.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
  const siteName = s.SITE_NAME || process.env.NEXT_PUBLIC_SITE_NAME || "ForeverComicCon";
  const description = `${siteName} — ${describeTx(tx)}`.slice(0, 200);
  const common = { reference: tx.id, email: buyer.email, customerId: buyer.id, description, returnUrl: `${base}/app/checkout/done?tx=${tx.id}`, cancelUrl: `${base}/app/checkout/${tx.id}?cancelled=1`, embed: opts.embed, origin: opts.origin };
  const res = tx.kind === "tier" ? await divinitycoin.createSetupCheckout(common) : await divinitycoin.createCheckout({ ...common, amountCents: tx.amountCents, currency: "usd" });
  if (!res.success || !res.checkoutUrl) throw new Error(res.error || "Could not start DivinityCoin checkout.");
  const origin = cleanOrigin(opts.origin);
  await db.update(schema.transactions).set({ sessionId: res.sessionId ?? null, provider: "divinitycoin", ...(origin.ip ? { customerIp: origin.ip, customerUserAgent: origin.userAgent } : {}) }).where(eq(schema.transactions.id, tx.id));
  if (origin.ip && tx.kind === "tier") await db.update(schema.users).set({ cardIp: origin.ip, cardUserAgent: origin.userAgent }).where(eq(schema.users.id, buyer.id));
  await bumpSiteDaily({ checkoutStarts: 1 });
  return { url: res.checkoutUrl, sessionId: res.sessionId ?? null, mode: tx.kind === "tier" ? "setup" : "payment" };
}

/** Pay a transaction with the buyer's DivinityCoin credit balance: hold → capture → settle. */
export async function payWithCredits(txId: string, userId: string): Promise<void> {
  await ensureMigrated();
  const [tx] = await db.select().from(schema.transactions).where(and(eq(schema.transactions.id, txId), eq(schema.transactions.buyerId, userId))).limit(1);
  if (!tx) throw new Error("Transaction not found.");
  if (tx.status === "paid") return;
  if (tx.kind === "tier") throw new Error("Plans need a saved card, not credits.");
  const s = await getSettings(["DIVINITYCOIN_ALLOW_CREDITS"]);
  if (!flag(s.DIVINITYCOIN_ALLOW_CREDITS, true)) throw new Error("Paying with credits is disabled.");
  const amount = tx.amountCents / 100;
  const balance = await divinitycoin.getBalance(userId);
  if (balance.available < amount) throw new Error(`Not enough DivinityCoin credit: $${balance.available.toFixed(2)} available, $${amount.toFixed(2)} needed.`);
  const hold = await divinitycoin.placeHold(userId, amount, tx.id, new Date(now() + 3600_000));
  if (!hold.success) throw new Error(hold.error || "Could not hold credits.");
  const cap = await divinitycoin.captureHold(tx.id);
  if (!cap.success) {
    await divinitycoin.releaseHold(tx.id).catch(() => {});
    throw new Error(cap.error || "Could not capture credits.");
  }
  await settle(tx.id, "divinitycoin", hold.holdId ?? "credits");
}

/** Authoritative outcome of a hosted checkout, asked of DivinityCoin. Settles the transaction when complete. */
export type CheckoutOutcome = { ok: true; status: "complete" } | { ok: false; status: "pending" | "failed" | "expired" | "canceled" | "unknown"; message: string };
export async function confirmCheckoutSession(txId: string, sessionId: string): Promise<CheckoutOutcome> {
  await ensureMigrated();
  const [tx] = await db.select().from(schema.transactions).where(eq(schema.transactions.id, txId)).limit(1);
  if (!tx) return { ok: false, status: "unknown", message: "Transaction not found." };
  if (tx.status === "paid") return { ok: true, status: "complete" };
  if (tx.kind === "tier") {
    const { confirmPlanSetup } = await import("@/lib/subscriptions");
    return confirmPlanSetup(tx, sessionId);
  }
  if (sessionId.startsWith("cs_test_")) return tx.status === "paid" ? { ok: true, status: "complete" } : { ok: false, status: "pending", message: "Waiting for the simulated webhook." };
  // an older tab's session is fine as long as DivinityCoin says it was for this transaction (checked just below)
  if (!sessionId.startsWith("cs_")) return { ok: false, status: "unknown", message: "That checkout session doesn’t belong to this transaction." };
  const sess = await divinitycoin.getCheckoutSession(sessionId);
  if (!sess || sess.pledgeId !== tx.id) return { ok: false, status: "unknown", message: "DivinityCoin has no checkout for this transaction." };
  if (sess.status === "pending") return { ok: false, status: "pending", message: "Checkout is still in progress." };
  if (sess.status === "failed") return { ok: false, status: "failed", message: "Your card couldn’t be processed. Please try a different card." };
  if (sess.status === "expired") return { ok: false, status: "expired", message: "The checkout session expired. Please try again." };
  if (sess.status === "canceled") return { ok: false, status: "canceled", message: "Checkout was cancelled. Nothing was charged." };
  if (sess.amount !== null && sess.amount < tx.amountCents) return { ok: false, status: "unknown", message: "The amount paid doesn’t match. Contact support." };
  await settleCheckoutPayment(tx.id, sess.paymentIntentId ?? undefined);
  // say "complete" only if it really applied; a payment that couldn't be applied has been flagged for a refund
  const [after] = await db.select().from(schema.transactions).where(eq(schema.transactions.id, tx.id)).limit(1);
  if (after?.status !== "paid") return { ok: false, status: "unknown", message: "Your payment went through but we couldn't apply it. You'll be refunded; nothing else to do." };
  if ((after.notes ?? "").includes("NOT APPLIED")) return { ok: false, status: "failed", message: "Your payment went through but this purchase was no longer available. You'll be refunded in full." };
  return { ok: true, status: "complete" };
}

/** A hosted-checkout charge lands on DivinityCoin as credits held under our tx id. Capture so it settles to us, then settle. Idempotent. */
export async function settleCheckoutPayment(txId: string, paymentIntentId?: string) {
  let [tx] = await db.select().from(schema.transactions).where(eq(schema.transactions.id, txId)).limit(1);
  if (!tx) return;
  // money arrived for a checkout we had given up on (expired or failed earlier): take it up again, so settle either applies
  // it or flags it for a refund, instead of keeping the money and doing nothing
  if (tx.status === "failed") {
    await db.update(schema.transactions).set({ status: "pending", notes: [tx.notes, `Payment arrived after it was marked failed (${new Date().toISOString()}).`].filter(Boolean).join("\n") }).where(and(eq(schema.transactions.id, tx.id), eq(schema.transactions.status, "failed")));
    [tx] = await db.select().from(schema.transactions).where(eq(schema.transactions.id, txId)).limit(1);
  }
  // paid twice (two tabs, two sessions): the first payment applied; the second must not be kept silently
  if (tx.status === "paid" && paymentIntentId && tx.providerRef && !tx.providerRef.includes(paymentIntentId) && !(tx.notes ?? "").includes(paymentIntentId)) {
    const line = `SECOND PAYMENT ${paymentIntentId} received for an already-paid transaction: refund it.`;
    await db.update(schema.transactions).set({ notes: [tx.notes, line].filter(Boolean).join("\n") }).where(eq(schema.transactions.id, tx.id));
    const { recordError } = await import("@/lib/sentinel");
    await recordError({ kind: "server", where: "checkout", message: `Transaction ${tx.id} was paid twice (${paymentIntentId}); refund the extra payment.`, url: `/admin/transactions/${tx.id}` }).catch(() => {});
    return;
  }
  if (tx.status === "pending") {
    try {
      const cap = await divinitycoin.captureHold(tx.id);
      if (!cap.success) console.warn(`[divinitycoin] capture for tx ${tx.id} not confirmed:`, cap.error || cap.message);
    } catch (err) { console.error(`[divinitycoin] capture failed for tx ${tx.id}:`, err); }
  }
  await settle(tx.id, "divinitycoin", paymentIntentId || tx.providerRef || tx.sessionId || undefined);
}

export async function markTxFailed(txId: string, reason: string) {
  await ensureMigrated();
  await db.update(schema.transactions).set({ status: "failed", notes: reason.slice(0, 500) }).where(and(eq(schema.transactions.id, txId), eq(schema.transactions.status, "pending")));
}

/** Admin refund through DivinityCoin (full or partial). Claims refunded in full release the booth. */
export async function refundTx(txId: string, amountCents: number | undefined, reason: string, adminName: string): Promise<{ refundedCents: number }> {
  await ensureMigrated();
  const [tx] = await db.select().from(schema.transactions).where(eq(schema.transactions.id, txId)).limit(1);
  if (!tx) throw new Error("Transaction not found.");
  if (tx.status !== "paid") throw new Error("Only paid transactions can be refunded.");
  const amt = Number.isFinite(amountCents) && Number(amountCents) > 0 ? Math.min(Number(amountCents), tx.amountCents - tx.refundedCents) : tx.amountCents - tx.refundedCents;
  if (amt <= 0) throw new Error("Nothing left to refund.");
  // reserve the amount first, in one conditional statement: a double-click or two admins can't refund it twice
  const claimed = await db.update(schema.transactions).set({ refundedCents: sql`${schema.transactions.refundedCents} + ${amt}` })
    .where(and(eq(schema.transactions.id, tx.id), eq(schema.transactions.refundedCents, tx.refundedCents), eq(schema.transactions.status, "paid"))).returning({ id: schema.transactions.id });
  if (!claimed.length) throw new Error("This transaction changed while you were refunding it. Reload and check before trying again.");
  const unclaim = () => db.update(schema.transactions).set({ refundedCents: sql`max(0, ${schema.transactions.refundedCents} - ${amt})` }).where(eq(schema.transactions.id, tx.id));
  let refundId = "";
  if (tx.provider === "divinitycoin" && tx.amountCents > 0) {
    // plan charges store "<period ref>|<payment intent>"; checkout payments store the intent (or a cs_ session id)
    let pi = (tx.providerRef || "").includes("|") ? (tx.providerRef || "").split("|").pop() || "" : tx.providerRef || "";
    if (!pi || pi.startsWith("cs_")) {
      const sess = tx.sessionId ? await divinitycoin.getCheckoutSession(tx.sessionId).catch(() => null) : null;
      if (!sess?.paymentIntentId) { await unclaim(); throw new Error("DivinityCoin has no completed payment for this transaction. Mark it refunded manually if you refunded another way."); }
      pi = sess.paymentIntentId;
    }
    const partial = amt < tx.amountCents;
    const r = await divinitycoin.refund(pi, partial ? amt : undefined, reason || "Admin refund", tx.id, partial);
    if (!r.success) { await unclaim(); throw new Error(`DivinityCoin refund failed: ${r.error || "unknown error"}`); }
    refundId = r.refundId ?? "";
  }
  const full = tx.refundedCents + amt >= tx.amountCents;
  await db.update(schema.transactions).set({
    status: full ? "refunded" : "paid",
    // the refund id lets the matching refund.completed webhook recognise this refund and not count it again
    notes: [tx.notes, `Refunded $${(amt / 100).toFixed(2)} by ${adminName} on ${new Date().toISOString()}${refundId ? ` (${refundId})` : ""}${reason ? ` — ${reason}` : ""}`].filter(Boolean).join("\n"),
  }).where(eq(schema.transactions.id, tx.id));
  if (full) {
    const { revokeReferral } = await import("@/lib/referrals"); await revokeReferral(tx.id);
    const { reverseGrant } = await import("@/lib/reversals"); await reverseGrant(tx);
  }
  return { refundedCents: amt };
}
