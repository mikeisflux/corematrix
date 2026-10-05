import { NextResponse } from "next/server";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/lib/db";
import { guard, pageParams, paged, like } from "../_lib";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const g = await guard(); if (g instanceof NextResponse) return g;
  await ensureMigrated();
  const url = new URL(req.url);
  const a = schema.adminAuditLog;
  const q = (url.searchParams.get("q") || "").trim(), resource = url.searchParams.get("resource") || "";
  const where = and(resource ? eq(a.resource, resource) : undefined, q ? or(sql`${a.action} LIKE ${like(q)}`, sql`${a.adminEmail} LIKE ${like(q)}`, sql`${a.resourceId} LIKE ${like(q)}`, sql`${a.after} LIKE ${like(q)}`) : undefined);
  const { page, size, skip, take } = pageParams(url);
  const [[{ total }], rows, resources] = await Promise.all([
    db.select({ total: sql<number>`count(*)` }).from(a).where(where),
    db.select().from(a).where(where).orderBy(desc(a.createdAt)).limit(take).offset(skip),
    db.select({ r: a.resource }).from(a).groupBy(a.resource),
  ]);
  const parse = (s: string | null) => { try { return s ? JSON.parse(s) : null; } catch { return s; } };
  return NextResponse.json({ ...paged(rows.map((r) => ({ ...r, before: parse(r.before), after: parse(r.after) })), Number(total), page, size), resources: resources.map((x) => x.r) });
}
