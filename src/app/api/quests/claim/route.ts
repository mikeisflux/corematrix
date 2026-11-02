import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { claimQuest } from "@/lib/quests";

const Body = z.object({ quest: z.enum(["visit", "theater", "arcade", "bonus"]) });

export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const r = await claimQuest(u.id, parsed.data.quest);
  if (!r.awarded) return NextResponse.json({ error: "Nothing to claim yet", ...r }, { status: 409 });
  return NextResponse.json(r);
}
