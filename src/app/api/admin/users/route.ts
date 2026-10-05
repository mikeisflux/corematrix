import { NextResponse } from "next/server";
import { desc, eq, or, sql } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/lib/db";
import { guard, pageParams, paged, like, toCsv, csvResponse } from "../_lib";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const g = await guard(); if (g instanceof NextResponse) return g;
  await ensureMigrated();
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim();
  const u = schema.users;
  const where = q ? or(sql`${u.email} LIKE ${like(q)}`, sql`${u.displayName} LIKE ${like(q)}`, sql`${u.handle} LIKE ${like(q)}`, eq(u.id, q)) : undefined;
  const cols = { id: u.id, email: u.email, displayName: u.displayName, handle: u.handle, creditCents: u.creditCents, coins: u.coins, isAdmin: u.isAdmin, createdAt: u.createdAt, lastSeenAt: u.lastSeenAt, referredBy: u.referredBy, booths: sql<number>`(select count(*) from booths p where p.owner_id = ${u.id})`, spentCents: sql<number>`(select coalesce(sum(amount_cents),0) from transactions t where t.buyer_id = ${u.id} and t.status = 'paid')` };
  if (url.searchParams.get("export") === "csv") {
    const rows = await db.select(cols).from(u).where(where).orderBy(desc(u.createdAt)).limit(10000);
    return csvResponse("users.csv", toCsv(["id", "email", "name", "handle", "booths", "spent_cents", "credit_cents", "coins", "admin", "created_at", "last_seen_at"], rows.map((r) => [r.id, r.email, r.displayName, r.handle, r.booths, r.spentCents, r.creditCents, r.coins, r.isAdmin, new Date(r.createdAt).toISOString(), r.lastSeenAt ? new Date(r.lastSeenAt).toISOString() : ""])));
  }
  const { page, size, skip, take } = pageParams(url);
  const [[{ total }], rows] = await Promise.all([db.select({ total: sql<number>`count(*)` }).from(u).where(where), db.select(cols).from(u).where(where).orderBy(desc(u.createdAt)).limit(take).offset(skip)]);
  return NextResponse.json(paged(rows.map((r) => ({ ...r, booths: Number(r.booths), spentCents: Number(r.spentCents) })), Number(total), page, size));
}
