import { NextResponse } from "next/server";
import { GAMES, leaderboard, myBest, type GameId } from "@/lib/arcade";
import { currentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const gameId = url.searchParams.get("game") as GameId;
  const scope = url.searchParams.get("scope") === "today" ? "today" : "all";
  if (!GAMES[gameId]) return NextResponse.json({ error: "Unknown game" }, { status: 400 });
  const u = await currentUser();
  const [rows, mine] = await Promise.all([leaderboard(gameId, scope), u ? myBest(gameId, u.id) : null]);
  return NextResponse.json({ rows, mine, me: u?.id ?? null });
}
