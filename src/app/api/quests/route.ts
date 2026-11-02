import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { questBoard } from "@/lib/quests";

export const dynamic = "force-dynamic";

/** Today's quest board for the signed-in player. */
export async function GET() {
  const u = await currentUser();
  if (!u) return NextResponse.json({ board: null });
  return NextResponse.json({ board: await questBoard(u.id) });
}
