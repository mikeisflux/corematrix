import { NextResponse } from "next/server";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/lib/db";
import { guard, pageParams, paged, like } from "../_lib";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const g = await guard("audit"); if (g instanceof NextResponse) return g;
  await ensureMigrated();
  const url = new URL(req.url);
  const a = schema.adminAuditLog;
  const q = (url.searchParams.get("q") || "").trim(), resource = url.searchParams.get("resource") || "";
  const where = and(resource ? eq(a.resource, resource) : undefined, q ? or(sql`${a.action} ILIKE ${like(q)} ESCAPE '\\'`, sql`${a.adminEmail} ILIKE ${like(q)} ESCAPE '\\'`, sql`${a.resourceId} ILIKE ${like(q)} ESCAPE '\\'`, sql`${a.after} ILIKE ${like(q)} ESCAPE '\\'`) : undefined);
  const { page, size, skip, take } = pageParams(url);
  const [[{ total }], rows, resources] = await Promise.all([
    db.select({ total: sql<number>`count(*)` }).from(a).where(where),
    db.select().from(a).where(where).orderBy(desc(a.createdAt)).limit(take).offset(skip),
    db.select({ r: a.resource }).from(a).groupBy(a.resource),
  ]);
  const parse = (s: string | null) => { try { return s ? JSON.parse(s) : null; } catch { return s; } };
  return NextResponse.json({ ...paged(rows.map((r) => ({ ...r, before: parse(r.before), after: parse(r.after) })), Number(total), page, size), resources: resources.map((x) => x.r) });
}
