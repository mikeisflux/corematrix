import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { SLOT_BETS, slotsBoard, spin } from "@/lib/slots";

export async function GET() {
  const u = await currentUser();
  return NextResponse.json({ ...(await slotsBoard(u?.id ?? null)), coins: u?.coins ?? null });
}

export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "Sign in to play. New players get free coins." }, { status: 401 });
  const parsed = z.object({ bet: z.number().int().refine((b) => (SLOT_BETS as readonly number[]).includes(b)) }).safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pick a bet from the table" }, { status: 400 });
  try {
    return NextResponse.json(await spin(u.id, parsed.data.bet));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
