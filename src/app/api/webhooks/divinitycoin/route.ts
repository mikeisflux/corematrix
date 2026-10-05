import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { verifyWebhookSignature } from "@/lib/divinitycoin";
import { finishWebhook, processDivinityEvent, recordWebhook } from "@/lib/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* DivinityCoin → us. Register on the partner record:
       https://<site>/api/webhooks/divinitycoin
   Header: X-Webhook-Signature: t=<unix>,v1=<hmac-sha256 hex of "<t>.<raw body>">
   Deliveries are deduplicated on (provider, event id). Always answers 200 for
   a verified event; processing errors are stored on the webhook row and can
   be re-run from Admin → Webhooks. */
export async function POST(req: Request) {
  const raw = await req.text();
  const sig = req.headers.get("x-webhook-signature") || req.headers.get("x-divinitycoin-signature") || req.headers.get("x-signature");
  const verified = await verifyWebhookSignature(raw, sig);
  if (!verified.ok) {
    console.warn("divinitycoin webhook rejected:", verified.reason);
    return NextResponse.json({ error: `invalid signature: ${verified.reason}` }, { status: 401 });
  }
  let evt: { id?: string; type?: string; event?: string; timestamp?: string; data?: Record<string, unknown> };
  try { evt = JSON.parse(raw); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const type = String(evt.event || evt.type || "");
  if (!type) return NextResponse.json({ error: "missing event" }, { status: 400 });
  const d = (evt.data ?? {}) as Record<string, unknown>;
  const subject = evt.id || d.disputeId || d.refundId || d.paymentIntentId || d.sessionId || d.setupIntentId || d.pledgeId || evt.timestamp || createHash("sha256").update(raw).digest("hex").slice(0, 24);
  const id = `${type}:${String(subject)}`;
  const rowId = await recordWebhook("divinitycoin", id, type, evt);
  if (!rowId) return NextResponse.json({ ok: true, duplicate: true });
  try {
    const result = await processDivinityEvent({ id, type, data: d });
    await finishWebhook(rowId, result.status, result.note ?? null);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("divinitycoin webhook", err);
    await finishWebhook(rowId, "failed", String(err).slice(0, 1000));
    return NextResponse.json({ ok: false, error: "processing failed; stored for retry" }, { status: 200 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: "divinitycoin webhook", method: "POST" });
}
