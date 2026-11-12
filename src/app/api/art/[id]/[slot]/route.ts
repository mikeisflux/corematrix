import { NextResponse } from "next/server";
import { getArt, isArtSlot, artBytes } from "@/lib/art";
import { fileUrl, isRef, r2Readable } from "@/lib/r2";
import { censored } from "@/lib/nudity";

// blurred stand-ins for 18+ pieces, keyed by booth, slot and version; small, and rebuilt on demand
const blurCache = new Map<string, Buffer>();

export const dynamic = "force-dynamic";

/** The stored artwork for a booth slot, same-origin so Three.js can use it as a texture. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string; slot: string }> }) {
  const { id, slot } = await ctx.params;
  if (!isArtSlot(slot)) return new NextResponse("not found", { status: 404 });
  const row = await getArt(Number(id), slot);
  if (!row) return new NextResponse("not found", { status: 404 });
  if (row.adult) {
    // an 18+ piece: everyone gets the blurred stand-in (the hall's textures included); the picture itself only goes to a
    // viewer who asked for it (?a=1) after confirming their age (the fcc_18 cookie). Never a redirect to the public bucket.
    const bytes = await artBytes(row);
    if (!bytes) return new NextResponse("not found", { status: 404 });
    const ok = new URL(req.url).searchParams.get("a") === "1" && /(?:^|;\s*)fcc_18=1(?:;|$)/.test(req.headers.get("cookie") ?? "");
    if (ok) return new NextResponse(new Uint8Array(bytes), { headers: { "Content-Type": row.mime, "Cache-Control": "private, max-age=3600", Vary: "Cookie" } });
    const key = `${id}/${slot}/${row.updatedAt}`;
    let blur = blurCache.get(key);
    if (!blur) { blur = await censored(bytes); if (blurCache.size > 300) blurCache.clear(); blurCache.set(key, blur); }
    // short and private: the same address serves the real picture once the age cookie is set
    return new NextResponse(new Uint8Array(blur), { headers: { "Content-Type": "image/jpeg", "Cache-Control": new URL(req.url).searchParams.get("a") === "1" ? "private, no-store" : "public, max-age=86400", Vary: "Cookie" } });
  }
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
