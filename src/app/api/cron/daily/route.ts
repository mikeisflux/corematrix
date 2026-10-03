import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron";
import { maintainPlans } from "@/lib/subscriptions";
import { ensureSeasons } from "@/lib/seasons";
import { pruneVisitorSeen } from "@/lib/emails";

export const dynamic = "force-dynamic";

/** Run once a day (any time). Safe to run more often. */
export async function GET(req: Request) {
  if (!cronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const plans = await maintainPlans();
  await ensureSeasons();
  await pruneVisitorSeen();
  return NextResponse.json({ ok: true, plans });
}
