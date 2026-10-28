import { NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/lib/db";
import { guard, pageParams, paged, like, readJson, bad } from "../_lib";
import { now } from "@/lib/util";
export const dynamic = "force-dynamic";

/** GET ?status=open|resolved|all&kind=client|server&q=&page= */
export async function GET(req: Request) {
  const g = await guard("errors"); if (g instanceof NextResponse) return g;
  await ensureMigrated();
  const url = new URL(req.url);
  const status = url.searchParams.get("status") || "open", kind = url.searchParams.get("kind") || "", q = (url.searchParams.get("q") || "").trim();
  const t = schema.sentinelErrors;
  const conds = [];
  if (status === "open") conds.push(sql`${t.resolvedAt} IS NULL`); else if (status === "resolved") conds.push(sql`${t.resolvedAt} IS NOT NULL`);
  if (kind) conds.push(eq(t.kind, kind));
  if (q) conds.push(sql`(${t.message} LIKE ${like(q)} OR ${t.where} LIKE ${like(q)} OR ${t.url} LIKE ${like(q)} OR ${t.ua} LIKE ${like(q)})`);
  const where = conds.length ? and(...conds) : undefined;
  const { page, size, skip, take } = pageParams(url, 50);
  const [[{ total }], rows, [open24]] = await Promise.all([
    db.select({ total: sql<number>`count(*)` }).from(t).where(where),
    db.select().from(t).where(where).orderBy(desc(t.lastAt)).limit(take).offset(skip),
    db.select({ n: sql<number>`coalesce(sum(count),0)` }).from(t).where(sql`${t.resolvedAt} IS NULL AND ${t.lastAt} > ${now() - 86_400_000}`),
  ]);
  return NextResponse.json({ ...paged(rows, Number(total), page, size), open24h: Number(open24.n) });
}

/** PATCH { id, resolved: boolean } */
export async function PATCH(req: Request) {
  const g = await guard("errors"); if (g instanceof NextResponse) return g;
  const b = await readJson<{ id?: string; resolved?: boolean }>(req);
  if (!b.id) return bad("id required");
  await db.update(schema.sentinelErrors).set({ resolvedAt: b.resolved === false ? null : now() }).where(eq(schema.sentinelErrors.id, b.id));
  return NextResponse.json({ ok: true });
}

/** DELETE ?scope=resolved|all */
export async function DELETE(req: Request) {
  const g = await guard("errors"); if (g instanceof NextResponse) return g;
  const scope = new URL(req.url).searchParams.get("scope") || "resolved";
  if (scope === "all") await db.delete(schema.sentinelErrors); else await db.delete(schema.sentinelErrors).where(sql`${schema.sentinelErrors.resolvedAt} IS NOT NULL`);
  return NextResponse.json({ ok: true });
}
