import { NextResponse } from "next/server";
import { getBooth } from "@/lib/economy";
import { fetchPublic } from "@/lib/safe-fetch";

/**
 * Serves a booth's logo. Stored logos are data URLs (portable, no object
 * storage needed); if none is set we render initials on the booth color.
 * Same-origin, so Three.js can use it as a texture without CORS games.
 */
/** Whatever the bytes are (older rows may hold an SVG), the browser must treat them as an inert image. */
const SAFE = { "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox", "X-Content-Type-Options": "nosniff" };

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const p = await getBooth(Number(id));
  if (!p || p.hidden) return new NextResponse("not found", { status: 404 });
  if (p.logoUrl?.startsWith("data:")) {
    const m = /^data:([^;]+);base64,(.*)$/.exec(p.logoUrl);
    if (m) {
      return new NextResponse(Buffer.from(m[2], "base64"), {
        headers: { ...SAFE, "Content-Type": m[1] === "image/svg+xml" ? "image/svg+xml" : m[1], "Cache-Control": "public, max-age=300" },
      });
    }
  }
  // only a static image file: any other local path would make every visitor's logo load hit it (page views, clicks...)
  if (p.logoUrl && /^\/(?!\/)[A-Za-z0-9_\-/]+\.(png|jpe?g|webp|gif)$/i.test(p.logoUrl) && !p.logoUrl.includes("..")) return NextResponse.redirect(new URL(p.logoUrl, _req.url), 307);
  if (p.logoUrl?.startsWith("http")) {
    // proxied so textures stay same-origin; only public hosts, no redirects, capped size
    const r = await fetchPublic(p.logoUrl, { timeoutMs: 4000, maxBytes: 2_000_000 }).catch(() => null);
    if (r && /^image\/(png|jpeg|webp|gif)$/i.test(r.type.split(";")[0].trim())) {
      return new NextResponse(new Uint8Array(r.body), { headers: { ...SAFE, "Content-Type": r.type, "Cache-Control": "public, max-age=3600" } });
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
