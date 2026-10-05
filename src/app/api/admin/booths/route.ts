import { NextResponse } from "next/server";
import { and, desc, eq, isNotNull, or, sql } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/lib/db";
import { guard, pageParams, paged, like } from "../_lib";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const g = await guard(); if (g instanceof NextResponse) return g;
  await ensureMigrated();
  const url = new URL(req.url);
  const p = schema.booths, u = schema.users;
  const q = (url.searchParams.get("q") || "").trim(), tier = url.searchParams.get("tier") || "", state = url.searchParams.get("state") || "claimed";
  const sort = url.searchParams.get("sort") || "value";
  const where = and(state === "claimed" ? isNotNull(p.ownerId) : state === "hidden" ? eq(p.hidden, true) : state === "shielded" ? sql`${p.notForSaleUntil} > ${Date.now()}` : isNotNull(p.ownerId), tier ? eq(p.tier, tier) : undefined,
    q ? or(sql`${p.name} LIKE ${like(q)}`, sql`${p.website} LIKE ${like(q)}`, sql`${u.email} LIKE ${like(q)}`, /^\d+$/.test(q) ? eq(p.id, Number(q)) : undefined) : undefined);
  const order = sort === "views" ? desc(p.totalViews) : sort === "clicks" ? desc(p.totalClicks) : sort === "recent" ? desc(p.claimedAt) : sort === "id" ? p.id : desc(p.valueCents);
  const { page, size, skip, take } = pageParams(url);
  const cols = { id: p.id, name: p.name, website: p.website, tier: p.tier, tierUntil: p.tierUntil, subscriptionStatus: p.subscriptionStatus, label: p.label, size: p.size, kind: p.kind, hall: p.hall, aisle: p.aisle, valueCents: p.valueCents, claimedAt: p.claimedAt, hidden: p.hidden, notForSaleUntil: p.notForSaleUntil, totalViews: p.totalViews, totalClicks: p.totalClicks, salesCount: p.salesCount, ownerId: p.ownerId, ownerEmail: u.email };
  const [[{ total }], rows] = await Promise.all([db.select({ total: sql<number>`count(*)` }).from(p).leftJoin(u, eq(u.id, p.ownerId)).where(where), db.select(cols).from(p).leftJoin(u, eq(u.id, p.ownerId)).where(where).orderBy(order).limit(take).offset(skip)]);
  return NextResponse.json(paged(rows, Number(total), page, size));
}
