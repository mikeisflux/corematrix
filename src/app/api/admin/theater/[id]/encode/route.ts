import { NextResponse } from "next/server";
import { requestEncode } from "@/lib/theater-encode";
import { bad, guard } from "../../../_lib";
export const dynamic = "force-dynamic";
/** Downsample a film for the screen (needs ffmpeg on the server). */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard("theater"); if (g instanceof NextResponse) return g;
  const { id } = await ctx.params;
  const ok = await requestEncode(id);
  if (!ok) return bad("ffmpeg is not installed on the server (apt install ffmpeg), or this is a link rather than an upload");
  return NextResponse.json({ ok: true });
}
