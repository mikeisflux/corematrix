import { NextResponse } from "next/server";
import { listPayouts, payoutTotals } from "@/lib/payouts";
import { guard, pageParams } from "../_lib";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const g = await guard(); if (g instanceof NextResponse) return g;
  const url = new URL(req.url);
  const { page, size } = pageParams(url);
  const [list, totals] = await Promise.all([listPayouts(url.searchParams.get("status") || "", page, size), payoutTotals()]);
  return NextResponse.json({ ...list, totals });
}
