import { NextResponse } from "next/server";
import { cronAuthorized } from "@/lib/cron";
import { runRenewals } from "@/lib/subscriptions";
import { ensureSeasons } from "@/lib/seasons";
import { pruneVisitorSeen } from "@/lib/emails";

export const dynamic = "force-dynamic";

/** Run once a day (any time). Safe to run more often. Charges plan renewals through DivinityCoin saved cards. */
export async function GET(req: Request) {
  if (!(await cronAuthorized(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const plans = await runRenewals();
  await ensureSeasons();
  await pruneVisitorSeen();
  return NextResponse.json({ ok: true, plans });
}
