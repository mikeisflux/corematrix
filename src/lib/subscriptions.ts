/* Plans (Pro / Landmark) on top of DivinityCoin, which has no subscription
   object: a setup-mode hosted checkout saves the owner's card, then we charge
   the first period and every renewal ourselves with
   charge-saved-payment-method. Renewals run from runRenewals() (daily cron
   and Admin → Plans → Run renewals). Retries a decline once a day for 7 days,
   then the plan drops to the free tier. */
import { and, desc, eq, lt, sql } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/lib/db";
import { TIERS, type Tier, formatMoney } from "@/lib/config";
import { newId, now } from "@/lib/util";
import { bumpSiteDaily } from "@/lib/analytics";
import { divinitycoin, type DivinityWebhookEvent } from "@/lib/divinitycoin";
import { addEvent, getPlot, settle, type Tx } from "@/lib/economy";
import { sendTemplate } from "@/lib/sendgrid";
import { getSettings } from "@/lib/settings";

const PERIOD = 30 * 86_400_000;
export const SUB_REF_PREFIX = "sub:";
export function isPlanReference(ref: string): boolean { return ref.startsWith(SUB_REF_PREFIX); }
function periodReference(plotId: number, periodStart: number): string { return `${SUB_REF_PREFIX}${plotId}:${new Date(periodStart).toISOString().slice(0, 10)}`; }
function parseReference(ref: string): { plotId: number; period: string } | null {
  const m = /^sub:(\d+):(\d{4}-\d{2}-\d{2})$/.exec(ref);
  return m ? { plotId: Number(m[1]), period: m[2] } : null;
}

async function ownerOf(plotId: number) {
  const p = await getPlot(plotId);
  if (!p?.ownerId) return null;
  const [u] = await db.select().from(schema.users).where(eq(schema.users.id, p.ownerId)).limit(1);
  return u ? { plot: p, user: u } : null;
}

/** Called when a tier purchase settles (first charge paid). Marks the plot as subscribed. */
export async function activatePlan(plotId: number, tier: Tier, paymentMethodId: string | null) {
  const t = now();
  const [p] = await db
    .update(schema.plots)
    .set({ tier, tierUntil: t + PERIOD, subscriptionId: paymentMethodId ? `pm:${paymentMethodId}` : `comp:${newId()}`, subscriptionStatus: "active", notForSaleUntil: tier === "landmark" ? t + 7 * 86_400_000 : null, updatedAt: t })
    .where(eq(schema.plots.id, plotId))
    .returning();
  return p;
}

export type SetupOutcome = { ok: true; status: "complete" } | { ok: false; status: "pending" | "failed" | "expired" | "canceled" | "unknown"; message: string };
/** Embedded-frame confirm for a setup-mode session: ask DivinityCoin, keep the card, charge the first period. */
export async function confirmPlanSetup(tx: Tx, sessionId: string): Promise<SetupOutcome> {
  if (tx.status === "paid") return { ok: true, status: "complete" };
  if (sessionId.startsWith("cs_test_")) return tx.status === "paid" ? { ok: true, status: "complete" } : { ok: false, status: "pending", message: "Waiting for the simulated webhook." };
  if (tx.sessionId && tx.sessionId !== sessionId) return { ok: false, status: "unknown", message: "That checkout session doesn’t belong to this plan." };
  const sess = await divinitycoin.getCheckoutSession(sessionId);
  if (!sess) return { ok: false, status: "unknown", message: "DivinityCoin has no checkout session for this plan." };
  if (sess.status === "pending") return { ok: false, status: "pending", message: "Card setup is still in progress." };
  if (sess.status !== "complete") return { ok: false, status: sess.status, message: sess.status === "failed" ? "Your card couldn’t be saved. Please try a different card." : sess.status === "expired" ? "The session expired. Please try again." : "Setup was cancelled. Nothing was charged." };
  if (!sess.paymentMethodId) return { ok: false, status: "unknown", message: "DivinityCoin didn’t return a saved card. Please try again." };
  const r = await onPlanSetupComplete({ sessionId, mode: "setup", paymentMethodId: sess.paymentMethodId });
  const [fresh] = await db.select().from(schema.transactions).where(eq(schema.transactions.id, tx.id)).limit(1);
  if (fresh?.status === "paid") return { ok: true, status: "complete" };
  return { ok: false, status: "failed", message: r.note?.startsWith("first charge failed") ? `Your card was saved but the first charge was declined (${r.note.replace("first charge failed: ", "")}).` : "The first charge didn’t go through. Try another card." };
}

/** Webhook checkout.completed (mode=setup) or the confirm above: remember the card, charge the first period. Idempotent. */
export async function onPlanSetupComplete(d: DivinityWebhookEvent["data"]): Promise<{ status: "processed" | "ignored"; note?: string }> {
  await ensureMigrated();
  const sessionId = String(d.sessionId || "");
  const [tx] = sessionId ? await db.select().from(schema.transactions).where(and(eq(schema.transactions.sessionId, sessionId), eq(schema.transactions.kind, "tier"))).limit(1) : [];
  if (!tx) return { status: "ignored", note: "no pending plan for setup session" };
  if (tx.status === "paid") return { status: "ignored", note: "plan already active" };
  if (!d.paymentMethodId) return { status: "ignored", note: "setup completed without a payment method" };
  if (tx.buyerId) await db.update(schema.users).set({ dcPaymentMethodId: d.paymentMethodId }).where(eq(schema.users.id, tx.buyerId));
  const r = await chargeFirstPeriod(tx, d.paymentMethodId);
  return r.ok ? { status: "processed", note: "plan started" } : { status: "processed", note: `first charge failed: ${r.error}` };
}

async function chargeFirstPeriod(tx: Tx, paymentMethodId: string): Promise<{ ok: boolean; error?: string }> {
  const meta = JSON.parse(tx.meta ?? "{}") as { tier?: Tier };
  const tier = meta.tier ?? "pro";
  const [buyer] = tx.buyerId ? await db.select().from(schema.users).where(eq(schema.users.id, tx.buyerId)).limit(1) : [];
  if (!buyer) return { ok: false, error: "buyer missing" };
  const ref = periodReference(tx.plotId, now());
  const s = await getSettings(["SITE_NAME"]);
  const charge = await divinitycoin.chargeSavedCard({
    customerId: buyer.id, paymentMethodId, amountCents: tx.amountCents, reference: ref, description: `${s.SITE_NAME || "AlwaysOnCon"} — ${TIERS[tier].name} plan, #${tx.plotId}`, idempotencyKey: `${ref}:${tx.id}`,
    origin: { ip: buyer.cardIp, userAgent: buyer.cardUserAgent },
  });
  if (!charge.success) {
    await db.update(schema.transactions).set({ status: "failed", notes: `first charge failed: ${charge.error || charge.status}` }).where(eq(schema.transactions.id, tx.id));
    return { ok: false, error: charge.error || charge.status || "declined" };
  }
  try { await divinitycoin.captureHold(ref); } catch (err) { console.error(`[divinitycoin] capture failed for ${ref}:`, err); }
  await db.update(schema.transactions).set({ meta: JSON.stringify({ ...meta, paymentMethodId }) }).where(eq(schema.transactions.id, tx.id));
  await settle(tx.id, "divinitycoin", charge.paymentIntentId ?? ref);
  return { ok: true };
}

/** Charge one renewal period with the saved card. Idempotent per (plot, period start). */
export async function chargeRenewal(plotId: number, periodStart: number): Promise<{ ok: boolean; error?: string; declined?: boolean }> {
  await ensureMigrated();
  const o = await ownerOf(plotId);
  if (!o) return { ok: false, error: "no owner" };
  const { plot, user } = o;
  const tier = plot.tier as Tier;
  if (tier === "free") return { ok: false, error: "no plan" };
  const pm = plot.subscriptionId?.startsWith("pm:") ? plot.subscriptionId.slice(3) : user.dcPaymentMethodId;
  const ref = periodReference(plotId, periodStart);
  if (plot.subscriptionId?.startsWith("comp:")) { await renewPlan(plotId, 0, "comp", ref); return { ok: true }; }
  const [already] = await db.select({ id: schema.transactions.id }).from(schema.transactions).where(and(eq(schema.transactions.plotId, plotId), eq(schema.transactions.kind, "tier"), eq(schema.transactions.status, "paid"), sql`${schema.transactions.providerRef} LIKE ${ref + "%"}`)).limit(1);
  if (already) return { ok: true };
  if (!pm) { await recordFailedPeriod(plotId, "no saved card on file"); return { ok: false, error: "no saved card" }; }
  const s = await getSettings(["SITE_NAME"]);
  const charge = await divinitycoin.chargeSavedCard({
    customerId: user.id, paymentMethodId: pm, amountCents: TIERS[tier].priceCents, reference: ref, description: `${s.SITE_NAME || "AlwaysOnCon"} — ${TIERS[tier].name} plan renewal, #${plotId}`, idempotencyKey: ref,
    origin: { ip: user.cardIp, userAgent: user.cardUserAgent },
  });
  if (!charge.success) {
    await recordFailedPeriod(plotId, charge.error || charge.status || "charge failed");
    return { ok: false, error: charge.error, declined: charge.httpStatus === 402 };
  }
  try { await divinitycoin.captureHold(ref); } catch (err) { console.error(`[divinitycoin] capture failed for ${ref}:`, err); }
  await renewPlan(plotId, TIERS[tier].priceCents, "divinitycoin", `${ref}|${charge.paymentIntentId ?? ""}`);
  return { ok: true };
}

async function recordFailedPeriod(plotId: number, reason: string) {
  const o = await ownerOf(plotId);
  if (!o) return;
  const tierName = TIERS[o.plot.tier as Tier]?.name ?? "plan";
  await db.update(schema.plots).set({ subscriptionStatus: "past_due", updatedAt: now() }).where(eq(schema.plots.id, plotId));
  await db.insert(schema.transactions).values({ id: newId(), plotId, kind: "tier", buyerId: o.user.id, amountCents: TIERS[o.plot.tier as Tier]?.priceCents ?? 0, status: "failed", provider: "divinitycoin", notes: reason.slice(0, 300), meta: JSON.stringify({ tier: o.plot.tier, renewal: true }), createdAt: now() });
  await sendTemplate("plan_payment_failed", o.user.email, {
    subject: `We couldn’t renew the ${tierName} on ${o.plot.name}`,
    fallbackText: `The card on file was declined (${reason}). Perks continue for 7 days while we retry; update your card from the dashboard.`,
    name: o.user.displayName ?? o.user.email, plotName: o.plot.name, planName: tierName, reason, plotId,
  }, { userId: o.user.id, plotId, channel: "system" }).catch(() => {});
}

/** A renewal payment arrived (our charge, or a late payment.succeeded webhook). Extends the period and books revenue. */
export async function renewPlan(plotId: number, amountCents: number, provider: "divinitycoin" | "comp", ref?: string) {
  await ensureMigrated();
  const o = await ownerOf(plotId);
  if (!o || o.plot.tier === "free") return;
  const tierName = TIERS[o.plot.tier as Tier].name;
  const base = Math.max(now(), o.plot.tierUntil ?? 0);
  await db.update(schema.plots).set({ tierUntil: base + PERIOD, subscriptionStatus: "active", updatedAt: now() }).where(eq(schema.plots.id, plotId));
  await db.insert(schema.transactions).values({ id: newId(), plotId, kind: "tier", buyerId: o.user.id, amountCents, platformCents: amountCents, valueBefore: o.plot.valueCents, valueAfter: o.plot.valueCents, status: "paid", provider, providerRef: ref ?? null, meta: JSON.stringify({ tier: o.plot.tier, renewal: true }), createdAt: now(), paidAt: now() });
  await bumpSiteDaily({ revenueCents: amountCents });
  await sendTemplate("plan_renewed", o.user.email, {
    subject: `${tierName} renewed on ${o.plot.name}`,
    fallbackText: `Your ${tierName} plan renewed for ${formatMoney(amountCents)}. It runs through ${new Date(base + PERIOD).toLocaleDateString()}.`,
    name: o.user.displayName ?? o.user.email, plotName: o.plot.name, planName: tierName, amount: formatMoney(amountCents), periodEnd: new Date(base + PERIOD).toLocaleDateString("en-US", { dateStyle: "long" }), plotId,
  }, { userId: o.user.id, plotId, channel: "system" }).catch(() => {});
}

/** payment.succeeded / payment.failed for a "sub:…" reference (covers a timed-out charge call). */
export async function onPlanChargeEvent(type: string, ref: string, d: DivinityWebhookEvent["data"]): Promise<{ status: "processed" | "ignored"; note?: string }> {
  const parsed = parseReference(ref);
  if (!parsed) return { status: "ignored", note: "bad plan reference" };
  if (type === "payment.succeeded") {
    const [paid] = await db.select({ id: schema.transactions.id }).from(schema.transactions).where(and(eq(schema.transactions.plotId, parsed.plotId), eq(schema.transactions.status, "paid"), sql`${schema.transactions.providerRef} LIKE ${ref + "%"}`)).limit(1);
    if (paid) return { status: "ignored", note: "period already recorded" };
    const [pendingFirst] = await db.select().from(schema.transactions).where(and(eq(schema.transactions.plotId, parsed.plotId), eq(schema.transactions.kind, "tier"), eq(schema.transactions.status, "pending"))).orderBy(desc(schema.transactions.createdAt)).limit(1);
    if (pendingFirst) { await settle(pendingFirst.id, "divinitycoin", d.paymentIntentId ?? ref); return { status: "processed", note: "plan started (webhook)" }; }
    try { await divinitycoin.captureHold(ref); } catch { /* retry from Admin → Webhooks */ }
    await renewPlan(parsed.plotId, typeof d.amount === "number" ? Math.round(d.amount) : 0, "divinitycoin", `${ref}|${d.paymentIntentId ?? ""}`);
    return { status: "processed", note: "plan period paid (webhook)" };
  }
  if (type === "payment.failed") {
    await recordFailedPeriod(parsed.plotId, String(d.error || d.declineCode || d.code || "declined"));
    return { status: "processed" };
  }
  return { status: "ignored", note: `unhandled ${type} for plan` };
}

/** Owner asked to stop. Keeps perks until the paid period ends; no DivinityCoin call needed. */
export async function cancelPlan(plotId: number, ownerId: string | null): Promise<{ until: number | null }> {
  await ensureMigrated();
  const p = await getPlot(plotId);
  if (!p || (ownerId && p.ownerId !== ownerId)) throw new Error("Not yours");
  if (p.tier === "free") throw new Error("No active plan");
  await db.update(schema.plots).set({ subscriptionStatus: "canceling", updatedAt: now() }).where(eq(schema.plots.id, plotId));
  return { until: p.tierUntil };
}

/** Renewals + expiry. Daily maintenance entry point (cron + Admin → Plans). */
export async function runRenewals(): Promise<{ charged: number; failed: number; ended: number; renewed: number; expired: number }> {
  await ensureMigrated();
  const t = now();
  const out = { charged: 0, failed: 0, ended: 0, renewed: 0, expired: 0 };
  const due = await db.select().from(schema.plots).where(and(sql`${schema.plots.tier} != 'free'`, lt(schema.plots.tierUntil, t))).limit(200);
  for (const p of due) {
    const periodStart = p.tierUntil ?? t;
    if (p.subscriptionStatus === "canceling" || p.subscriptionStatus === "canceled" || !p.ownerId) { await dropPlan(p.id, "ended"); out.ended++; continue; }
    const [lastFail] = await db.select().from(schema.transactions).where(and(eq(schema.transactions.plotId, p.id), eq(schema.transactions.kind, "tier"), eq(schema.transactions.status, "failed"))).orderBy(desc(schema.transactions.createdAt)).limit(1);
    if (lastFail && t - lastFail.createdAt < 86_400_000 && lastFail.createdAt > periodStart) continue;
    if (t - periodStart > 7 * 86_400_000) { await dropPlan(p.id, "payment failed for 7 days"); out.expired++; continue; }
    const r = await chargeRenewal(p.id, periodStart);
    if (r.ok) { out.charged++; out.renewed++; } else out.failed++;
  }
  return out;
}

async function dropPlan(plotId: number, why: string) {
  const o = await ownerOf(plotId);
  await db.update(schema.plots).set({ tier: "free", tierUntil: null, subscriptionId: null, subscriptionStatus: null, updatedAt: now() }).where(eq(schema.plots.id, plotId));
  await addEvent("tier", plotId, `${o?.plot.name ?? "A booth"} is back on the free plan`, null, null);
  if (o && why !== "ended") {
    await sendTemplate("plan_cancelled", o.user.email, { subject: `The plan on ${o.plot.name} ended`, fallbackText: `We couldn’t collect payment for a week, so the plan ended (${why}). Upgrade again any time from the dashboard.`, name: o.user.displayName ?? o.user.email, plotName: o.plot.name, plotId }, { userId: o.user.id, plotId, channel: "system" }).catch(() => {});
  }
}

/** Monthly recurring revenue from plans that will renew. */
export async function currentMrrCents(): Promise<number> {
  await ensureMigrated();
  const [r] = await db.select({
    pro: sql<number>`sum(case when tier='pro' and subscription_status='active' then 1 else 0 end)`,
    lm: sql<number>`sum(case when tier='landmark' and subscription_status='active' then 1 else 0 end)`,
  }).from(schema.plots);
  return Number(r?.pro ?? 0) * TIERS.pro.priceCents + Number(r?.lm ?? 0) * TIERS.landmark.priceCents;
}

export const maintainPlans = async () => { const r = await runRenewals(); return { renewed: r.renewed, expired: r.expired + r.ended }; };
