import { NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { currentUser } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { now } from "@/lib/util";

export const dynamic = "force-dynamic";

export async function GET() {
  const u = await currentUser();
  if (!u) return NextResponse.json({ notifications: [] });
  const rows = await db.select().from(schema.notifications).where(eq(schema.notifications.userId, u.id)).orderBy(desc(schema.notifications.createdAt)).limit(30);
  return NextResponse.json({ notifications: rows });
}

/** POST { upTo? }: mark read everything up to that moment (what was on screen), not notices that arrived since. */
export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ ok: false }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { upTo?: unknown };
  const upTo = typeof b.upTo === "number" && Number.isFinite(b.upTo) ? b.upTo : now();
  await db.update(schema.notifications).set({ readAt: now() }).where(and(eq(schema.notifications.userId, u.id), sql`${schema.notifications.readAt} IS NULL`, sql`${schema.notifications.createdAt} <= ${upTo}`));
  return NextResponse.json({ ok: true });
}
