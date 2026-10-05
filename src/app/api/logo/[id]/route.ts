import { NextResponse } from "next/server";
import { getBooth } from "@/lib/economy";

/**
 * Serves a booth's logo. Stored logos are data URLs (portable, no object
 * storage needed); if none is set we render initials on the booth color.
 * Same-origin, so Three.js can use it as a texture without CORS games.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const p = await getBooth(Number(id));
  if (!p) return new NextResponse("not found", { status: 404 });
  if (p.logoUrl?.startsWith("data:")) {
    const m = /^data:([^;]+);base64,(.*)$/.exec(p.logoUrl);
    if (m) {
      return new NextResponse(Buffer.from(m[2], "base64"), {
        headers: { "Content-Type": m[1], "Cache-Control": "public, max-age=300" },
      });
    }
  }
  if (p.logoUrl?.startsWith("http")) {
    // Proxy remote logos so textures stay same-origin. Small timeout, cached.
    try {
      const r = await fetch(p.logoUrl, { signal: AbortSignal.timeout(4000) });
      if (r.ok && (r.headers.get("content-type") ?? "").startsWith("image/")) {
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf.length < 2_000_000) {
          return new NextResponse(buf, { headers: { "Content-Type": r.headers.get("content-type")!, "Cache-Control": "public, max-age=3600" } });
        }
      }
    } catch {
      /* fall through to initials */
    }
  }
  const initials = (p.name ?? `#${p.id}`)
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><rect width="256" height="256" rx="32" fill="${p.color}"/><text x="128" y="128" font-family="Inter, Arial, sans-serif" font-size="112" font-weight="800" fill="${p.accent}" text-anchor="middle" dominant-baseline="central">${initials.replace(/[<>&]/g, "")}</text></svg>`;
  return new NextResponse(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=300" } });
}
