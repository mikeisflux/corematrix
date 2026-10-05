import { NextResponse } from "next/server";
import { getBooth } from "@/lib/economy";
import { trackBooth } from "@/lib/analytics";
import { bumpSiteDaily } from "@/lib/analytics";
import { getOrSetVisitor } from "@/lib/visitor";
import { SITE_URL } from "@/lib/config";

/** Outbound click redirect: /go/42?src=banner → owner's website, with UTM tags and tracking. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const boothId = Number(id);
  const src = new URL(req.url).searchParams.get("src") ?? "direct";
  const p = Number.isFinite(boothId) ? await getBooth(boothId) : null;
  if (!p?.website) return NextResponse.redirect(`${SITE_URL}/app/booth/${id}`);
  const target = new URL(p.website);
  if (!target.searchParams.has("utm_source")) {
    target.searchParams.set("utm_source", new URL(SITE_URL).hostname);
    target.searchParams.set("utm_medium", "booth");
    target.searchParams.set("utm_campaign", `booth-${boothId}`);
    target.searchParams.set("utm_content", src);
  }
  const res = NextResponse.redirect(target.toString(), 302);
  const visitor = await getOrSetVisitor(res);
  await trackBooth(boothId, "clicks", visitor, src.slice(0, 40));
  await bumpSiteDaily({ outboundClicks: 1 });
  return res;
}
