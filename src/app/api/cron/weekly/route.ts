import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron";
import { ensureSeasons } from "@/lib/seasons";
import { sendWeeklyDigests } from "@/lib/emails";

export const dynamic = "force-dynamic";

/** Run Monday after 00:00 UTC: closes the season, then emails every owner their week. */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  await ensureSeasons();
  const sent = await sendWeeklyDigests();
  return NextResponse.json({ ok: true, digests: sent });
}
