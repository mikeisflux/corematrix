import { NextResponse } from "next/server";
import { getPlot } from "@/lib/economy";
import { trackPlot } from "@/lib/analytics";
import { bumpSiteDaily } from "@/lib/analytics";
import { getOrSetVisitor } from "@/lib/visitor";
import { SITE_URL } from "@/lib/config";

/** Outbound click redirect: /go/42?src=skyline → owner's website, with UTM tags and tracking. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const plotId = Number(id);
  const src = new URL(req.url).searchParams.get("src") ?? "direct";
  const p = Number.isFinite(plotId) ? await getPlot(plotId) : null;
  if (!p?.website) return NextResponse.redirect(`${SITE_URL}/plot/${id}`);
  const target = new URL(p.website);
  if (!target.searchParams.has("utm_source")) {
    target.searchParams.set("utm_source", new URL(SITE_URL).hostname);
    target.searchParams.set("utm_medium", "building");
    target.searchParams.set("utm_campaign", `plot-${plotId}`);
    target.searchParams.set("utm_content", src);
  }
  const res = NextResponse.redirect(target.toString(), 302);
  const visitor = await getOrSetVisitor(res);
  await trackPlot(plotId, "clicks", visitor, src.slice(0, 40));
  await bumpSiteDaily({ outboundClicks: 1 });
  return res;
}
