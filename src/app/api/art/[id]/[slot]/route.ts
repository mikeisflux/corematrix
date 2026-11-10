import { NextResponse } from "next/server";
import { getArt, isArtSlot, artBytes } from "@/lib/art";
import { fileUrl, isRef, r2Readable } from "@/lib/r2";

export const dynamic = "force-dynamic";

/** The stored artwork for a booth slot, same-origin so Three.js can use it as a texture. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string; slot: string }> }) {
  const { id, slot } = await ctx.params;
  if (!isArtSlot(slot)) return new NextResponse("not found", { status: 404 });
  const row = await getArt(Number(id), slot);
  if (!row) return new NextResponse("not found", { status: 404 });
  if (isRef(row.url)) {
    // on R2: send the browser to the bucket when it has a public URL (the key is versioned, so the redirect can be cached), else stream it
    const cfg = await r2Readable();
    if (cfg?.publicUrl) return NextResponse.redirect(fileUrl(row.url, cfg), { status: 302, headers: { "Cache-Control": "public, max-age=3600" } });
    const bytes = await artBytes(row);
    if (!bytes) return new NextResponse("not found", { status: 404 });
    return new NextResponse(new Uint8Array(bytes), { headers: { "Content-Type": row.mime, "Cache-Control": "public, max-age=31536000, immutable" } });
  }
  return new NextResponse(Buffer.from(row.data, "base64"), { headers: { "Content-Type": row.mime, "Cache-Control": "public, max-age=31536000, immutable" } });
}
