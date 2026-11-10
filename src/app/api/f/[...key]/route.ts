import { NextResponse } from "next/server";
import { r2Get, r2Readable } from "@/lib/r2";

export const dynamic = "force-dynamic";

/** Streams a stored object through the server, for buckets without a public URL. Keys are versioned, so a year's cache is safe. */
export async function GET(_req: Request, ctx: { params: Promise<{ key: string[] }> }) {
  const { key } = await ctx.params;
  const k = key.map(decodeURIComponent).join("/");
  if (!/^(art|logo)\/[A-Za-z0-9_\-./]+$/.test(k) || k.includes("..")) return new NextResponse("not found", { status: 404 });
  const cfg = await r2Readable(); if (!cfg) return new NextResponse("storage off", { status: 404 });
  const obj = await r2Get(cfg, k).catch(() => null);
  if (!obj) return new NextResponse("not found", { status: 404 });
  return new NextResponse(Buffer.from(obj.body), { headers: { "Content-Type": /^image\//.test(obj.type) ? obj.type : "application/octet-stream", "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
}
