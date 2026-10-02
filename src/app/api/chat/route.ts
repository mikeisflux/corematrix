import { NextResponse } from "next/server";
import { z } from "zod";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { currentUser } from "@/lib/auth";
import { db, ensureMigrated, schema } from "@/lib/db";
import { newId, now } from "@/lib/util";
import { publish } from "@/lib/realtime";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  await ensureMigrated();
  const room = new URL(req.url).searchParams.get("room") ?? "lobby";
  const rows = await db
    .select()
    .from(schema.messages)
    .where(and(eq(schema.messages.room, room), eq(schema.messages.hidden, false)))
    .orderBy(desc(schema.messages.createdAt))
    .limit(60);
  return NextResponse.json({ messages: rows.reverse().map(({ userId: _u, hidden: _h, ...m }) => m) });
}

const Body = z.object({ room: z.string().max(30), body: z.string().min(1).max(400) });
const URL_RE = /https?:\/\/|www\.|\.(xyz|lol|fun|io|com|net|org)\b/i;

/**
 * Anti-spam rules (the thing Claim Avenue's bar is missing):
 *  - only building owners can post links
 *  - 1 message / 5 s, 30 / hour per user
 *  - identical message within 10 minutes is dropped
 */
export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "Sign in to chat" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Message too long or empty" }, { status: 400 });
  const { room, body } = parsed.data;
  const [plot] = await db
    .select({ id: schema.plots.id, name: schema.plots.name })
    .from(schema.plots)
    .where(eq(schema.plots.ownerId, u.id))
    .orderBy(desc(schema.plots.valueCents))
    .limit(1);
  if (URL_RE.test(body) && !plot) return NextResponse.json({ error: "Only building owners can post links. Claim a plot from $5." }, { status: 403 });
  const t = now();
  const [recent] = await db
    .select({ n: sql<number>`count(*)`, last: sql<number>`max(${schema.messages.createdAt})` })
    .from(schema.messages)
    .where(and(eq(schema.messages.userId, u.id), gte(schema.messages.createdAt, t - 3600_000)));
  if (Number(recent?.n ?? 0) >= 30) return NextResponse.json({ error: "Slow down: 30 messages per hour" }, { status: 429 });
  if (Number(recent?.last ?? 0) > t - 5000) return NextResponse.json({ error: "Slow down a little" }, { status: 429 });
  const [dup] = await db
    .select({ n: sql<number>`count(*)` })
    .from(schema.messages)
    .where(and(eq(schema.messages.userId, u.id), eq(schema.messages.body, body), gte(schema.messages.createdAt, t - 600_000)));
  if (Number(dup?.n ?? 0) > 0) return NextResponse.json({ error: "You just said that" }, { status: 429 });
  const msg = { id: newId(), room, userId: u.id, authorName: plot?.name ?? u.displayName ?? "visitor", authorPlotId: plot?.id ?? null, body, createdAt: t };
  await db.insert(schema.messages).values(msg);
  publish({ type: "chat", message: { id: msg.id, room, authorName: msg.authorName, authorPlotId: msg.authorPlotId, body, createdAt: t } });
  return NextResponse.json({ ok: true });
}
