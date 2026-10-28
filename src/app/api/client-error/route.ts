import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrSetVisitor } from "@/lib/visitor";

export const dynamic = "force-dynamic";

const Body = z.object({ message: z.string().max(500), stack: z.string().max(4000).optional(), url: z.string().max(500).optional(), where: z.string().max(60).optional(), ua: z.string().max(300).optional() });
const g = globalThis as unknown as { __fccErrRate?: Map<string, number[]> };
const rate = (g.__fccErrRate ??= new Map<string, number[]>());

/** Browser-side errors from the hall, written to the server log (pm2 logs) so a white screen on someone's laptop leaves a stack here. */
export async function POST(req: Request) {
  const id = await getOrSetVisitor();
  const t = Date.now();
  const stamps = (rate.get(id) ?? []).filter((x) => x > t - 60_000);
  if (stamps.length >= 10) return NextResponse.json({ ok: false }, { status: 429 });
  stamps.push(t); rate.set(id, stamps);
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ ok: false }, { status: 400 });
  console.error(`[client-error] ${b.data.where ?? "window"} visitor=${id} url=${b.data.url ?? "?"} ua=${b.data.ua ?? "?"}\n  ${b.data.message}\n  ${(b.data.stack ?? "").split("\n").slice(0, 12).join("\n  ")}`);
  return NextResponse.json({ ok: true });
}
