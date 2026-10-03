import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { getPlot, plotHistory, updateBuilding } from "@/lib/economy";
import { plotReferrerRows, plotSeries, sumSeries } from "@/lib/analytics";
import { lastWeekRank } from "@/lib/seasons";
import { claimedPlots } from "@/lib/economy";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const plotId = Number(id);
  const p = await getPlot(plotId);
  if (!p || !p.ownerId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const u = await currentUser();
  const isOwner = !!u && u.id === p.ownerId;
  const days = isOwner && p.tier !== "free" ? 90 : isOwner ? 30 : 7;
  const series = await plotSeries(plotId, days);
  const history = await plotHistory(plotId);
  const referrers = isOwner ? await plotReferrerRows(plotId) : [];
  const all = await claimedPlots();
  const rank = all.filter((x) => x.valueCents > p.valueCents).length + 1;
  const prevRank = await lastWeekRank(plotId);
  return NextResponse.json({ plot: { ...p, isOwner }, series, totals: sumSeries(series), history, referrers, rank, prevRank });
}

const Patch = z.object({
  name: z.string().max(60).optional(),
  tagline: z.string().max(120).optional(),
  description: z.string().max(800).optional(),
  website: z.string().max(300).optional(),
  logoUrl: z.string().max(400_000).nullable().optional(),
  color: z.string().max(9).optional(),
  accent: z.string().max(9).optional(),
  style: z.string().max(20).optional(),
  shape: z.string().max(20).optional(),
  roof: z.string().max(20).optional(),
  district: z.string().max(30).optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const { id } = await ctx.params;
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 400 });
  try {
    const d = { ...parsed.data, logoUrl: parsed.data.logoUrl ?? undefined };
    const plot = await updateBuilding(Number(id), u.id, d);
    return NextResponse.json({ plot });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
