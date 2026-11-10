import { NextResponse } from "next/server";
import { fileUrl, r2Get, r2Readable } from "@/lib/r2";
import { readLocalVrm } from "@/lib/vrm";

export const dynamic = "force-dynamic";

/** Streams a stored object through the server, for buckets without a public URL. Keys are versioned, so a year's cache is safe. */
export async function GET(_req: Request, ctx: { params: Promise<{ key: string[] }> }) {
  const { key } = await ctx.params;
  const k = key.map(decodeURIComponent).join("/");
  if (!/^(art|logo|vrm)\/[A-Za-z0-9_\-./]+$/.test(k) || k.includes("..")) return new NextResponse("not found", { status: 404 });
  const cfg = await r2Readable();
  if (k.startsWith("vrm/")) {
    // a visitor's own avatar model: in R2 when storage is on (a public bucket URL is the cheapest path), else on disk
    const name = k.slice(4);
    if (cfg) {
      const pub = fileUrl(`r2:${k}`, cfg); if (pub.startsWith("http")) return NextResponse.redirect(pub, 302);
      const obj = await r2Get(cfg, k).catch(() => null);
      if (obj) return new NextResponse(Buffer.from(obj.body), { headers: { "Content-Type": "model/gltf-binary", "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
    }
    const local = await readLocalVrm(name);
    if (!local) return new NextResponse("not found", { status: 404 });
    return new NextResponse(Buffer.from(local), { headers: { "Content-Type": "model/gltf-binary", "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
  }
  if (!cfg) return new NextResponse("storage off", { status: 404 });
  const obj = await r2Get(cfg, k).catch(() => null);
  if (!obj) return new NextResponse("not found", { status: 404 });
  return new NextResponse(Buffer.from(obj.body), { headers: { "Content-Type": /^image\//.test(obj.type) ? obj.type : "application/octet-stream", "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" } });
}
