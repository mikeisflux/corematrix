import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrSetPlayer } from "@/lib/visitor";
import { allow } from "@/lib/throttle";
import { recordError } from "@/lib/sentinel";
import { currentUser, clientIp } from "@/lib/auth";

export const dynamic = "force-dynamic";

const Body = z.object({ message: z.string().max(500), stack: z.string().max(4000).optional(), url: z.string().max(500).optional(), where: z.string().max(60).optional(), ua: z.string().max(300).optional() });

/** Browser-side errors from the hall, written to the server log (pm2 logs) so a white screen on someone's laptop leaves a stack here. */
export async function POST(req: Request) {
  // limited by address (a cookieless script would get a fresh visitor every time), and the visitor is recorded by its
  // public floor id: the private cookie is what proves who someone is, so it must not sit in a log staff can read
  if (!allow(`clienterr:${await clientIp()}`, 20, 60_000)) return NextResponse.json({ ok: false }, { status: 429 });
  const id = await getOrSetPlayer();
  const b = Body.safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ ok: false }, { status: 400 });
  console.error(`[client-error] ${b.data.where ?? "window"} visitor=${id} url=${b.data.url ?? "?"} ua=${b.data.ua ?? "?"}\n  ${b.data.message}\n  ${(b.data.stack ?? "").split("\n").slice(0, 12).join("\n  ")}`);
  const u = await currentUser().catch(() => null);
  await recordError({ kind: "client", where: b.data.where ?? "window", message: b.data.message, stack: b.data.stack ?? null, url: b.data.url ?? null, ua: b.data.ua ?? null, visitorId: id, userId: u?.id ?? null }).catch(() => {});
  return NextResponse.json({ ok: true });
}
