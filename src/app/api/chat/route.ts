import { NextResponse } from "next/server";
import { getOrSetPlayer } from "@/lib/visitor";
import { z } from "zod";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { currentUser } from "@/lib/auth";
import { db, ensureMigrated, schema } from "@/lib/db";
import { newId, now } from "@/lib/util";
import { publish, publishTo } from "@/lib/realtime";
import { friendsOf } from "@/lib/social-graph";
import { visitorsOf } from "@/lib/presence";
import { notify } from "@/lib/notify";
import { allow } from "@/lib/throttle";

export const dynamic = "force-dynamic";

/** The friends room is per person: what my friends and I posted there. Signed out, it is empty. */
async function friendUids(): Promise<string[] | null> {
  const u = await currentUser();
  if (!u) return null;
  const f = await friendsOf(u.id);
  return [u.id, ...f.friends.map((p) => p.id)];
}

export async function GET(req: Request) {
  await ensureMigrated();
  const room = new URL(req.url).searchParams.get("room") ?? "lobby";
  let scope = undefined as ReturnType<typeof inArray> | undefined;
  if (room === "friends") { const ids = await friendUids(); if (!ids) return NextResponse.json({ messages: [] }); scope = inArray(schema.messages.userId, ids); }
  const rows = await db
    .select()
    .from(schema.messages)
    .where(and(eq(schema.messages.room, room), eq(schema.messages.hidden, false), scope))
    .orderBy(desc(schema.messages.createdAt))
    .limit(60);
  return NextResponse.json({ messages: rows.reverse().map(({ userId, hidden: _h, ...m }) => ({ ...m, authorUid: userId })) });
}

const Body = z.object({ room: z.string().max(30), body: z.string().min(1).max(400) });
const URL_RE = /https?:\/\/|www\.|\.(xyz|lol|fun|io|com|net|org)\b/i;

/**
 * Anti-spam rules (the thing Claim Avenue's bar is missing):
 *  - only exhibitors can post links
 *  - 1 message / 5 s, 30 / hour per user
 *  - identical message within 10 minutes is dropped
 */
export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "Sign in to chat" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Message too long or empty" }, { status: 400 });
  const { room, body } = parsed.data;
  // decided before any await, so two messages sent at once can't both slip past the 5 second rule
  if (!allow(`chat:${u.id}`, 1, 5000)) return NextResponse.json({ error: "Slow down a little" }, { status: 429 });
  const [booth] = await db
    .select({ id: schema.booths.id, name: schema.booths.name })
    .from(schema.booths)
    .where(eq(schema.booths.ownerId, u.id))
    .orderBy(desc(schema.booths.valueCents))
    .limit(1);
  if (URL_RE.test(body) && !booth) return NextResponse.json({ error: "Only exhibitors can post links. Get a booth from $5." }, { status: 403 });
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
  const msg = { id: newId(), room, userId: u.id, authorName: booth?.name ?? u.displayName ?? "visitor", authorBoothId: booth?.id ?? null, body, createdAt: t };
  await db.insert(schema.messages).values(msg);
  const out = { type: "chat" as const, message: { id: msg.id, room, authorName: msg.authorName, authorBoothId: msg.authorBoothId, body, createdAt: t, playerId: await getOrSetPlayer(), authorUid: u.id } };
  // the friends room goes only to my friends' tabs (and my own); everything else is for the whole hall
  if (room === "friends") { const ids = (await friendUids()) ?? [u.id]; publishTo(ids.flatMap((id) => visitorsOf(id)), out); }
  else publish(out);
  // @handle mentions tell the person, even if they are not in the hall right now
  const handles = Array.from(new Set((body.match(/@([a-z0-9_]{2,30})/gi) ?? []).map((h) => h.slice(1).toLowerCase()))).slice(0, 5);
  for (const h of handles) {
    const [who] = await db.select({ id: schema.users.id }).from(schema.users).where(sql`lower(${schema.users.handle}) = ${h}`);
    if (who && who.id !== u.id) await notify(who.id, "mention", `${msg.authorName} mentioned you in hall chat`, body.slice(0, 200));
  }
  return NextResponse.json({ ok: true });
}
