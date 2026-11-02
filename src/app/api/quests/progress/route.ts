import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { reportTheater, questBoard, THEATER_REPORT_CAP } from "@/lib/quests";
import { allow } from "@/lib/throttle";

const Body = z.object({ quest: z.literal("theater"), seconds: z.number().min(0).max(600) });

/** The client reports time spent at the theater while a film plays. Each report may add at most THEATER_REPORT_CAP
 *  seconds and reports are accepted every 20 s, so a script can't bank the quest faster than about twice real time. */
export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  if (!allow(`quest-theater:${u.id}`, 1, 20_000)) return NextResponse.json({ board: await questBoard(u.id) });
  await reportTheater(u.id, Math.min(THEATER_REPORT_CAP, parsed.data.seconds));
  return NextResponse.json({ board: await questBoard(u.id) });
}
