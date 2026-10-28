/**
 * Sentinel: one place for errors. Browsers post theirs (hall error boundary,
 * window errors); server routes report through Next's onRequestError hook.
 * Repeats of the same message in the same place within an hour fold into one
 * row with a count, so a crash loop is one line, not a thousand.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/lib/db";
import { newId, now } from "@/lib/util";

export interface ErrorInput { kind: "client" | "server"; where: string; message: string; stack?: string | null; url?: string | null; ua?: string | null; visitorId?: string | null; userId?: string | null }

export async function recordError(e: ErrorInput) {
  await ensureMigrated();
  const message = e.message.slice(0, 500), where = e.where.slice(0, 60);
  const [dup] = await db.select({ id: schema.sentinelErrors.id }).from(schema.sentinelErrors)
    .where(and(eq(schema.sentinelErrors.kind, e.kind), eq(schema.sentinelErrors.where, where), eq(schema.sentinelErrors.message, message), sql`${schema.sentinelErrors.resolvedAt} IS NULL`, sql`${schema.sentinelErrors.lastAt} > ${now() - 3_600_000}`))
    .orderBy(desc(schema.sentinelErrors.lastAt)).limit(1);
  if (dup) {
    await db.update(schema.sentinelErrors).set({ count: sql`${schema.sentinelErrors.count} + 1`, lastAt: now(), stack: e.stack?.slice(0, 6000) ?? undefined, url: e.url?.slice(0, 500) ?? undefined, ua: e.ua?.slice(0, 300) ?? undefined, visitorId: e.visitorId ?? undefined, userId: e.userId ?? undefined }).where(eq(schema.sentinelErrors.id, dup.id));
    return dup.id;
  }
  const id = newId();
  await db.insert(schema.sentinelErrors).values({ id, kind: e.kind, where, message, stack: e.stack?.slice(0, 6000) ?? null, url: e.url?.slice(0, 500) ?? null, ua: e.ua?.slice(0, 300) ?? null, visitorId: e.visitorId ?? null, userId: e.userId ?? null, count: 1, firstAt: now(), lastAt: now(), resolvedAt: null });
  return id;
}
