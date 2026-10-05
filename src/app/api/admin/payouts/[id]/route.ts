import { NextResponse } from "next/server";
import { markPayoutPaid, rejectPayout } from "@/lib/payouts";
import { guard, readJson, str } from "../../_lib";
export const dynamic = "force-dynamic";
/* POST { action: "paid", reference, note? } | { action: "reject", reason } */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard(); if (g instanceof NextResponse) return g;
  const { id } = await ctx.params;
  const b = await readJson<{ action?: string; reference?: string; note?: string; reason?: string }>(req);
  try {
    if (b.action === "paid") return NextResponse.json({ ok: true, payout: await markPayoutPaid(id, { id: g.id, email: g.email }, str(b.reference, 120), str(b.note, 300)) });
    if (b.action === "reject") return NextResponse.json({ ok: true, payout: await rejectPayout(id, { id: g.id, email: g.email }, str(b.reason, 300)) });
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
