import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { myPayouts, requestPayout } from "@/lib/payouts";
import { PAYOUT_MIN_CENTS, PAYOUT_MAX_CENTS } from "@/lib/config";

export const dynamic = "force-dynamic";
const Body = z.object({ amountCents: z.number().int().min(PAYOUT_MIN_CENTS).max(PAYOUT_MAX_CENTS), paypalEmail: z.string().max(200), legalName: z.string().max(120), address: z.string().max(400) });

export async function GET() {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  return NextResponse.json({ payouts: await myPayouts(u.id), creditCents: u.creditCents, minCents: PAYOUT_MIN_CENTS });
}
export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: `Check the form: minimum ${PAYOUT_MIN_CENTS / 100} dollars, a PayPal email, your legal name and address` }, { status: 400 });
  try {
    const p = await requestPayout(u.id, parsed.data);
    return NextResponse.json({ ok: true, payout: p, payouts: await myPayouts(u.id) });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
