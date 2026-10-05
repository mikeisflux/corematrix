import { NextResponse } from "next/server";
import { getArt, isArtSlot } from "@/lib/art";

export const dynamic = "force-dynamic";

/** The stored artwork for a booth slot, same-origin so Three.js can use it as a texture. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string; slot: string }> }) {
  const { id, slot } = await ctx.params;
  if (!isArtSlot(slot)) return new NextResponse("not found", { status: 404 });
  const row = await getArt(Number(id), slot);
  if (!row) return new NextResponse("not found", { status: 404 });
  return new NextResponse(Buffer.from(row.data, "base64"), { headers: { "Content-Type": row.mime, "Cache-Control": "public, max-age=31536000, immutable" } });
}
