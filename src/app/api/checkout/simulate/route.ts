import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { getSettings, flag } from "@/lib/settings";
import { signWebhookPayload, DC_PROJECT_ID } from "@/lib/divinitycoin";

/* Test mode only: builds a DivinityCoin-shaped event, signs it with the
   configured webhook secret and POSTs it to our own /api/webhooks/divinitycoin
   so the real handler runs end to end. */
export async function POST(req: Request) {
  const s = await getSettings(["DIVINITYCOIN_TEST_MODE", "DIVINITYCOIN_WEBHOOK_SECRET"]);
  if (!flag(s.DIVINITYCOIN_TEST_MODE)) return NextResponse.json({ error: "Test mode is off." }, { status: 403 });
  const { reference, amount, kind, outcome } = await req.json();
  if (!reference) return NextResponse.json({ error: "reference required" }, { status: 400 });
  if (!s.DIVINITYCOIN_WEBHOOK_SECRET) return NextResponse.json({ error: "Set DIVINITYCOIN_WEBHOOK_SECRET in Admin → Settings first (any long random string works in test mode)." }, { status: 400 });
  const amountCents = Math.round(Number(amount) * 100);
  const isSetup = kind === "setup";
  const event = isSetup ? (outcome === "failed" ? "checkout.canceled" : "checkout.completed") : (outcome === "failed" ? "payment.failed" : "payment.succeeded");
  const data = isSetup
    ? { sessionId: `cs_test_setup_${reference}`, mode: "setup", partnerId: "test", platformUserId: "", email: "", amount: null, currency: "usd", pledgeId: null, projectId: null, paymentIntentId: null, setupIntentId: `seti_test_${randomBytes(6).toString("hex")}`, paymentMethodId: outcome === "failed" ? null : `pm_test_${randomBytes(6).toString("hex")}`, status: outcome === "failed" ? "canceled" : "complete", completedAt: new Date().toISOString() }
    : { sessionId: `cs_test_${reference}`, mode: "payment", paymentIntentId: `pi_test_${randomBytes(8).toString("hex")}`, amount: amountCents, platformUserId: "", pledgeId: reference, projectId: DC_PROJECT_ID, type: "initial",
        ...(outcome === "failed" ? { error: "Your card was declined.", code: "card_declined", declineCode: "generic_decline", status: "requires_payment_method" } : { hold: { holdId: `hold_test_${randomBytes(4).toString("hex")}`, amount: amountCents, status: "ACTIVE" }, paymentMethod: { type: "card", brand: "visa", last4: "4242" } }) };
  const body = JSON.stringify({ event, timestamp: new Date().toISOString(), data });
  const sig = signWebhookPayload(body, s.DIVINITYCOIN_WEBHOOK_SECRET);
  const origin = new URL(req.url).origin;
  const res = await fetch(`${origin}/api/webhooks/divinitycoin`, { method: "POST", headers: { "Content-Type": "application/json", "X-Webhook-Signature": sig, "X-Webhook-Event": event }, body });
  const out = await res.json().catch(() => ({}));
  return NextResponse.json({ ok: res.ok, webhook: out }, { status: res.ok ? 200 : 502 });
}
