import { NextResponse } from "next/server";
import { desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { audit } from "@/lib/auth";
import { refundTx, markTxFailed, describeTx } from "@/lib/payments";
import { settle } from "@/lib/economy";
import { sendReceipt } from "@/lib/emails";
import { guard, bad, notFound, readJson, int, optStr } from "../../_lib";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
export async function GET(_req: Request, ctx: Ctx) {
  const g = await guard(); if (g instanceof NextResponse) return g;
  const { id } = await ctx.params;
  const [tx] = await db.select().from(schema.transactions).where(eq(schema.transactions.id, id));
  if (!tx) return notFound();
  const [[buyer], [seller], [plot], webhooks, mail] = await Promise.all([
    tx.buyerId ? db.select({ id: schema.users.id, email: schema.users.email, displayName: schema.users.displayName }).from(schema.users).where(eq(schema.users.id, tx.buyerId)) : [null],
    tx.sellerId ? db.select({ id: schema.users.id, email: schema.users.email, displayName: schema.users.displayName }).from(schema.users).where(eq(schema.users.id, tx.sellerId)) : [null],
    db.select({ id: schema.plots.id, name: schema.plots.name, ownerId: schema.plots.ownerId, tier: schema.plots.tier, valueCents: schema.plots.valueCents }).from(schema.plots).where(eq(schema.plots.id, tx.plotId)),
    db.select({ id: schema.webhookEvents.id, type: schema.webhookEvents.type, status: schema.webhookEvents.status, receivedAt: schema.webhookEvents.receivedAt, error: schema.webhookEvents.error }).from(schema.webhookEvents).where(sql`${schema.webhookEvents.payload} LIKE ${`%${id}%`}`).orderBy(desc(schema.webhookEvents.receivedAt)).limit(20),
    db.select({ id: schema.mailMessages.id, subject: schema.mailMessages.subject, status: schema.mailMessages.status, toEmail: schema.mailMessages.toEmail, createdAt: schema.mailMessages.createdAt }).from(schema.mailMessages).where(eq(schema.mailMessages.txId, id)).orderBy(desc(schema.mailMessages.createdAt)),
  ]);
  let meta: unknown = null; try { meta = tx.meta ? JSON.parse(tx.meta) : null; } catch { meta = tx.meta; }
  return NextResponse.json({ tx: { ...tx, meta }, description: describeTx(tx), buyer, seller, plot, webhooks, mail });
}
/* POST { action: "refund" | "mark_paid" | "mark_failed" | "resend_receipt" | "note", amountCents?, reason?, note? } */
export async function POST(req: Request, ctx: Ctx) {
  const g = await guard(); if (g instanceof NextResponse) return g;
  const { id } = await ctx.params;
  const [tx] = await db.select().from(schema.transactions).where(eq(schema.transactions.id, id));
  if (!tx) return notFound();
  const b = await readJson(req);
  const reason = optStr(b.reason, 300) || "";
  try {
    switch (b.action) {
      case "refund": {
        const r = await refundTx(id, b.amountCents === undefined || b.amountCents === "" ? undefined : int(b.amountCents), reason, g.email);
        await audit(g.id, "tx.refund", "transaction", id, { status: tx.status, refundedCents: tx.refundedCents }, { refundedCents: r.refundedCents, reason }, g.email);
        return NextResponse.json({ ok: true, ...r });
      }
      case "mark_paid": {
        if (tx.status !== "pending" && tx.status !== "failed") return bad("Only pending or failed transactions can be marked paid.");
        if (tx.status === "failed") await db.update(schema.transactions).set({ status: "pending" }).where(eq(schema.transactions.id, id));
        const settled = await settle(id, "comp", `admin:${g.email}`);
        await db.update(schema.transactions).set({ notes: [tx.notes, `Marked paid by ${g.email}${reason ? ` — ${reason}` : ""}`].filter(Boolean).join("\n") }).where(eq(schema.transactions.id, id));
        await audit(g.id, "tx.mark_paid", "transaction", id, { status: tx.status }, { status: settled?.status ?? "paid", reason }, g.email);
        return NextResponse.json({ ok: true });
      }
      case "mark_failed": {
        if (tx.status !== "pending") return bad("Only pending transactions can be marked failed.");
        await markTxFailed(id, reason || `Canceled by ${g.email}`);
        await audit(g.id, "tx.mark_failed", "transaction", id, { status: tx.status }, { reason }, g.email);
        return NextResponse.json({ ok: true });
      }
      case "resend_receipt": {
        if (tx.status !== "paid" || !tx.buyerId) return bad("Receipts are only sent for paid transactions.");
        await sendReceipt(tx.buyerId, describeTx(tx), tx.amountCents, tx.id, tx.plotId);
        await audit(g.id, "tx.resend_receipt", "transaction", id, undefined, undefined, g.email);
        return NextResponse.json({ ok: true });
      }
      case "note": {
        const notes = optStr(b.note, 4000);
        await db.update(schema.transactions).set({ notes }).where(eq(schema.transactions.id, id));
        await audit(g.id, "tx.note", "transaction", id, { notes: tx.notes }, { notes }, g.email);
        return NextResponse.json({ ok: true });
      }
      default: return bad("Unknown action");
    }
  } catch (e) { return bad(String((e as Error).message || e)); }
}
