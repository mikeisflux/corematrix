import { NextResponse } from "next/server";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/lib/db";
import { guard, pageParams, paged, like, toCsv, csvResponse } from "../_lib";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const g = await guard(); if (g instanceof NextResponse) return g;
  await ensureMigrated();
  const url = new URL(req.url);
  const t = schema.transactions, u = schema.users;
  const status = url.searchParams.get("status") || "", kind = url.searchParams.get("kind") || "", provider = url.searchParams.get("provider") || "", q = (url.searchParams.get("q") || "").trim();
  const where = and(status ? eq(t.status, status) : undefined, kind ? eq(t.kind, kind) : undefined, provider ? eq(t.provider, provider) : undefined,
    q ? or(eq(t.id, q), sql`${t.providerRef} LIKE ${like(q)}`, sql`${t.sessionId} LIKE ${like(q)}`, sql`${u.email} LIKE ${like(q)}`, /^\d+$/.test(q) ? eq(t.plotId, Number(q)) : undefined) : undefined);
  const cols = { id: t.id, plotId: t.plotId, kind: t.kind, status: t.status, provider: t.provider, amountCents: t.amountCents, refundedCents: t.refundedCents, sellerPayoutCents: t.sellerPayoutCents, platformCents: t.platformCents, createdAt: t.createdAt, paidAt: t.paidAt, providerRef: t.providerRef, buyerEmail: u.email, buyerId: t.buyerId };
  const base = () => db.select(cols).from(t).leftJoin(u, eq(u.id, t.buyerId)).where(where).orderBy(desc(t.createdAt));
  if (url.searchParams.get("export") === "csv") {
    const rows = await base().limit(20000);
    return csvResponse("transactions.csv", toCsv(["id", "created_at", "paid_at", "kind", "status", "provider", "booth", "buyer", "amount_cents", "refunded_cents", "seller_payout_cents", "platform_cents", "provider_ref"], rows.map((r) => [r.id, new Date(r.createdAt).toISOString(), r.paidAt ? new Date(r.paidAt).toISOString() : "", r.kind, r.status, r.provider, r.plotId, r.buyerEmail, r.amountCents, r.refundedCents, r.sellerPayoutCents, r.platformCents, r.providerRef])));
  }
  const { page, size, skip, take } = pageParams(url);
  const [[{ total, sum }], rows] = await Promise.all([db.select({ total: sql<number>`count(*)`, sum: sql<number>`coalesce(sum(case when ${t.status} = 'paid' then ${t.amountCents} else 0 end),0)` }).from(t).leftJoin(u, eq(u.id, t.buyerId)).where(where), base().limit(take).offset(skip)]);
  return NextResponse.json({ ...paged(rows, Number(total), page, size), paidSumCents: Number(sum) });
}
