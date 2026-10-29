/* DivinityCoin webhook processing (DivinityCoin → us). Envelope
   { event, timestamp, data }; data.pledgeId is our reference: a transaction
   id, or "sub:<boothId>:<period>" for plan renewals. */
import { eq } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/lib/db";
import type { DivinityWebhookEvent } from "@/lib/divinitycoin";
import { markTxFailed, settleCheckoutPayment } from "@/lib/payments";
import { isPlanReference, onPlanChargeEvent, onPlanSetupComplete } from "@/lib/subscriptions";
import { getSettings } from "@/lib/settings";
import { sendTemplate } from "@/lib/sendgrid";
import { formatMoney } from "@/lib/config";
import { now } from "@/lib/util";

export type ProcessResult = { status: "processed" | "ignored"; note?: string };

export async function processDivinityEvent(evt: { id: string; type: string; data: Record<string, unknown> }): Promise<ProcessResult> {
  await ensureMigrated();
  const d = evt.data as DivinityWebhookEvent["data"];
  const ref = String(d.pledgeId || "");
  const amountCents = typeof d.amount === "number" ? Math.round(d.amount) : undefined;
  if (ref && isPlanReference(ref)) return onPlanChargeEvent(evt.type, ref, d);

  const findTx = async () => (ref ? (await db.select().from(schema.transactions).where(eq(schema.transactions.id, ref)).limit(1))[0] : undefined);

  switch (evt.type) {
    case "test.ping":
      return { status: "ignored", note: "ping" };

    case "checkout.completed": {
      if (d.mode === "setup") return onPlanSetupComplete(d);
      const tx = await findTx();
      if (!tx) return { status: "ignored", note: ref ? "unknown transaction" : "no pledgeId" };
      // same amount guard as payment.succeeded: a short payment never settles through the other event
      if (amountCents !== undefined && amountCents < tx.amountCents) {
        await db.update(schema.transactions).set({ notes: [tx.notes, `DivinityCoin checkout completed for ${amountCents}¢ but the amount due is ${tx.amountCents}¢ — check before honouring.`].filter(Boolean).join("\n") }).where(eq(schema.transactions.id, tx.id));
        return { status: "ignored", note: "amount mismatch" };
      }
      await settleCheckoutPayment(tx.id, d.paymentIntentId);
      return { status: "processed", note: `tx ${tx.id} checkout complete` };
    }

    case "payment.succeeded": {
      const tx = await findTx();
      if (!tx) return { status: "ignored", note: ref ? "unknown transaction" : "no pledgeId" };
      if (amountCents !== undefined && amountCents < tx.amountCents) {
        await db.update(schema.transactions).set({ notes: [tx.notes, `DivinityCoin paid ${amountCents}¢ but the amount due is ${tx.amountCents}¢ — check before honouring.`].filter(Boolean).join("\n") }).where(eq(schema.transactions.id, tx.id));
        return { status: "ignored", note: "amount mismatch" };
      }
      await settleCheckoutPayment(tx.id, d.paymentIntentId);
      return { status: "processed", note: `tx ${tx.id} paid` };
    }

    case "payment.failed": {
      // one declined card is not the end: the buyer can try another card in the same checkout, so only note it
      const ftx = ref ? await findTx() : undefined;
      if (ftx && ftx.status === "pending") await db.update(schema.transactions).set({ notes: [ftx.notes, `Card declined ${new Date().toISOString().slice(0, 16)}: ${String(d.error || d.declineCode || d.code || "declined")}`].filter(Boolean).join("\n").slice(-2000) }).where(eq(schema.transactions.id, ftx.id));
      return { status: "processed", note: "decline noted" };
    }
    case "checkout.failed":
    case "checkout.expired":
    case "checkout.canceled": {
      if (!ref) return { status: "ignored" };
      // every checkout page load opens a new session for the same transaction: a stale session expiring must not fail a
      // payment that a newer session is completing
      const ftx = await findTx();
      if (ftx?.sessionId && d.sessionId && String(d.sessionId) !== ftx.sessionId) return { status: "ignored", note: "superseded session" };
      const reason = String(d.error || d.declineCode || d.code || evt.type);
      await markTxFailed(ref, `${evt.type}: ${reason}`);
      return { status: "processed", note: reason };
    }

    case "refund.completed": {
      const tx = ref ? await findTx() : d.paymentIntentId ? (await db.select().from(schema.transactions).where(eq(schema.transactions.providerRef, String(d.paymentIntentId))).limit(1))[0] : undefined;
      if (!tx) return { status: "ignored", note: "unknown transaction" };
      if (d.refundId && (tx.notes ?? "").includes(String(d.refundId))) return { status: "ignored", note: "refund already recorded" }; // our own admin refund
      const amt = amountCents ?? tx.amountCents;
      const refunded = Math.min(tx.amountCents, tx.refundedCents + amt);
      const full = !d.partial && refunded >= tx.amountCents;
      await db.update(schema.transactions).set({ refundedCents: refunded, status: full ? "refunded" : tx.status, notes: [tx.notes, `${d.partial ? "Partial refund" : "Refunded"} ${formatMoney(amt)} via DivinityCoin (${d.refundId ?? "?"})`].filter(Boolean).join("\n") }).where(eq(schema.transactions.id, tx.id));
      if (full && tx.status !== "refunded") {
        const { revokeReferral } = await import("@/lib/referrals"); await revokeReferral(tx.id);
        const { reverseGrant } = await import("@/lib/reversals"); await reverseGrant(tx);
      }
      return { status: "processed", note: full ? "refunded" : "partial refund noted" };
    }

    case "dispute.created": {
      const pi = String(d.stripePaymentIntentId || d.paymentIntentId || "");
      const tx = ref ? await findTx() : pi ? (await db.select().from(schema.transactions).where(eq(schema.transactions.providerRef, pi)).limit(1))[0] : undefined;
      if (!tx) return { status: "ignored", note: "unknown transaction" };
      const note = `⚠ Chargeback opened ${new Date().toISOString().slice(0, 10)} — ${d.reason ?? "no reason"} (${d.disputeId ?? "?"}). Evidence due ${d.evidenceDueBy ?? "?"}.`;
      await db.update(schema.transactions).set({ status: "disputed", notes: [tx.notes, note].filter(Boolean).join("\n") }).where(eq(schema.transactions.id, tx.id));
      const s = await getSettings(["SUPPORT_EMAIL", "MAIL_BCC_ADMIN"]);
      const to = s.MAIL_BCC_ADMIN || s.SUPPORT_EMAIL;
      if (to) await sendTemplate("admin_dispute", to, { subject: `Chargeback on transaction ${tx.id}`, fallbackText: `${note}\n/admin/transactions/${tx.id}`, txId: tx.id, reason: String(d.reason ?? ""), amount: formatMoney(amountCents ?? tx.amountCents) }, { txId: tx.id, channel: "system" }).catch(() => {});
      { const { revokeReferral } = await import("@/lib/referrals"); await revokeReferral(tx.id); } // a chargeback doesn't keep the referral it earned
      if (tx.status !== "disputed") { const { onDispute } = await import("@/lib/reversals"); await onDispute(tx); }
      return { status: "processed", note: `tx ${tx.id} disputed` };
    }

    default:
      return { status: "ignored", note: `unhandled event ${evt.type}` };
  }
}

/** Insert a webhook row; returns null on duplicate (provider, eventId). */
export async function recordWebhook(provider: string, eventId: string, type: string, payload: unknown): Promise<string | null> {
  await ensureMigrated();
  const id = `${provider}_${eventId}`.replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, 180);
  const r = await db.insert(schema.webhookEvents).values({ id, provider, eventId, type, payload: JSON.stringify(payload), status: "received", receivedAt: now() }).onConflictDoNothing().returning({ id: schema.webhookEvents.id });
  return r.length ? r[0].id : null;
}

export async function finishWebhook(id: string, status: "processed" | "ignored" | "failed", error?: string | null) {
  await db.update(schema.webhookEvents).set({ status, error: error ?? null, processedAt: now() }).where(eq(schema.webhookEvents.id, id));
}
