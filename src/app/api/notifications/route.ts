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

export async function POST() {
  const u = await currentUser();
  if (!u) return NextResponse.json({ ok: false }, { status: 401 });
  await db.update(schema.notifications).set({ readAt: now() }).where(and(eq(schema.notifications.userId, u.id), sql`${schema.notifications.readAt} IS NULL`));
  return NextResponse.json({ ok: true });
}
