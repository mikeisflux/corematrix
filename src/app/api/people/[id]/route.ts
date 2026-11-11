import { NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { GAMES, type GameId } from "@/lib/rules";

/** What anyone may see of an account: the card that opens when you click a person on the floor. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await ensureMigrated();
  const [u] = await db.select({ id: schema.users.id, name: schema.users.displayName, handle: schema.users.handle, title: schema.users.title, since: schema.users.createdAt, streak: schema.users.streak }).from(schema.users).where(eq(schema.users.id, id));
  if (!u) return NextResponse.json({ error: "No such person" }, { status: 404 });
  const booths = await db.select({ id: schema.booths.id, name: schema.booths.name, hall: schema.booths.hall, category: schema.booths.category }).from(schema.booths).where(eq(schema.booths.ownerId, id)).orderBy(desc(schema.booths.valueCents)).limit(3);
  const bests = (await db.select({ gameId: schema.gameScores.gameId, best: sql<number>`max(${schema.gameScores.score})` }).from(schema.gameScores).where(eq(schema.gameScores.userId, id)).groupBy(schema.gameScores.gameId))
    .filter((b) => Object.hasOwn(GAMES, b.gameId)).map((b) => ({ game: GAMES[b.gameId as GameId].name, best: Number(b.best) })).sort((a, b) => b.best - a.best).slice(0, 3);
  const [fc] = await db.select({ n: sql<number>`count(*)` }).from(schema.friendships).where(and(eq(schema.friendships.status, "accepted"), sql`(${schema.friendships.fromId} = ${id} or ${schema.friendships.toId} = ${id})`));
  const me = await currentUser();
  return NextResponse.json({ id: u.id, name: u.name ?? "Visitor", handle: u.handle, title: u.title, since: Number(u.since), streak: u.streak, booths, bests, friends: Number(fc?.n ?? 0), me: me?.id ?? null });
}
