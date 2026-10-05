import { NextResponse } from "next/server";
import { getBooth, claimedBooths } from "@/lib/economy";
import { formatMoney, SITE_NAME } from "@/lib/config";

/** SVG badge owners embed on their sites: <a href="/app/booth/N?src=embed"><img src="/app/embed/N"></a> */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const p = await getBooth(Number(id));
  if (!p?.ownerId) return new NextResponse("not found", { status: 404 });
  const all = await claimedBooths();
  const rank = all.filter((x) => x.valueCents > p.valueCents).length + 1;
  const esc = (s: string) => s.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="64" viewBox="0 0 320 64" role="img" aria-label="${esc(p.name ?? "")} on ${SITE_NAME}">
  <defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#0b1020"/><stop offset="1" stop-color="#141a33"/></linearGradient></defs>
  <rect width="320" height="64" rx="12" fill="url(#g)" stroke="rgba(255,255,255,0.12)"/>
  <rect x="10" y="10" width="44" height="44" rx="10" fill="${p.color}"/>
  <text x="32" y="38" font-family="Inter,Arial,sans-serif" font-size="18" font-weight="800" fill="${p.accent}" text-anchor="middle">${esc((p.name ?? "?").slice(0, 2).toUpperCase())}</text>
  <text x="66" y="26" font-family="Inter,Arial,sans-serif" font-size="13" font-weight="700" fill="#eef2ff">${esc((p.name ?? "").slice(0, 26))}</text>
  <text x="66" y="44" font-family="ui-monospace,Menlo,monospace" font-size="11" fill="#9aa4c7">Booth #${p.id} · rank #${rank} · ${formatMoney(p.valueCents)}</text>
  <text x="310" y="40" font-family="Inter,Arial,sans-serif" font-size="10" font-weight="700" fill="#ffcf5c" text-anchor="end">${SITE_NAME.toUpperCase()}</text>
</svg>`;
  return new NextResponse(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=600" } });
}
