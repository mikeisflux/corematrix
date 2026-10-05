import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { currentUser, requestOrigin } from "@/lib/auth";
import { db, ensureMigrated, schema } from "@/lib/db";
import { confirmCheckoutSession, startCheckout } from "@/lib/payments";

/* Embedded DivinityCoin checkout → our page. The frame posts "complete"; we
   ask DivinityCoin for the authoritative outcome and settle. */
export async function POST(req: Request) {
  await ensureMigrated();
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const txId = String(body.txId || ""), sessionId = String(body.sessionId || "");
  if (!txId) return NextResponse.json({ error: "txId is required." }, { status: 400 });
  const [tx] = await db.select().from(schema.transactions).where(eq(schema.transactions.id, txId)).limit(1);
  if (!tx || tx.buyerId !== u.id) return NextResponse.json({ error: "Transaction not found." }, { status: 404 });
  if (body.reopen) {
    try { const r = await startCheckout(txId, { embed: false, origin: await requestOrigin() }); return NextResponse.json({ ok: true, url: r.url }); }
    catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : "Could not reopen checkout." }, { status: 400 }); }
  }
  if (!sessionId) return NextResponse.json({ error: "sessionId is required." }, { status: 400 });
  if (tx.sessionId && tx.sessionId !== sessionId) return NextResponse.json({ error: "Session mismatch." }, { status: 400 });
  try {
    const r = await confirmCheckoutSession(txId, sessionId);
    if (r.ok) return NextResponse.json({ ok: true, status: r.status, redirect: `/checkout/done?tx=${txId}` });
    return NextResponse.json({ ok: false, status: r.status, message: r.message }, { status: r.status === "pending" ? 202 : 400 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Could not verify the payment." }, { status: 502 });
  }
}
