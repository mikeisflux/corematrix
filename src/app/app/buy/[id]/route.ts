import { NextResponse } from "next/server";
import { trackBooth, bumpSiteDaily } from "@/lib/analytics";
import { countProductClick } from "@/lib/products";
import { getOrSetVisitor } from "@/lib/visitor";
import { allow } from "@/lib/throttle";
import { clientIp } from "@/lib/auth";
import { ensureMigrated } from "@/lib/db";

export const dynamic = "force-dynamic";

/** "Buy" on a shop item: counts the press for the booth and the item, then sends the visitor to the exhibitor's page. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  await ensureMigrated();
  const { id } = await ctx.params;
  const boothId = Number(id);
  const product = new URL(req.url).searchParams.get("p") ?? "";
  if (!Number.isFinite(boothId) || !/^[a-z0-9]{1,24}$/.test(product)) return NextResponse.redirect(new URL(`/app/booth/${id}`, req.url));
  const res = NextResponse.redirect(new URL(`/app/booth/${boothId}`, req.url), 302);
  const visitor = await getOrSetVisitor(res);
  const url = await countProductClick(boothId, product);
  if (!url) return res;
  if (allow(`buy:${await clientIp()}:${boothId}`, 10, 600_000)) { await trackBooth(boothId, "clicks", visitor, "shop"); await bumpSiteDaily({ outboundClicks: 1 }); }
  const out = new URL(url);
  if (!out.searchParams.has("utm_source")) { out.searchParams.set("utm_source", new URL(req.url).host); out.searchParams.set("utm_medium", "booth-shop"); out.searchParams.set("utm_campaign", `booth-${boothId}`); }
  return NextResponse.redirect(out.toString(), { status: 302, headers: res.headers });
}
