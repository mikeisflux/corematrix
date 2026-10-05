import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { getBooth, boothHistory, updateBooth } from "@/lib/economy";
import { artFlagsFor } from "@/lib/art";
import { boothReferrerRows, boothSeries, sumSeries } from "@/lib/analytics";
import { lastWeekRank } from "@/lib/seasons";
import { claimedBooths } from "@/lib/economy";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const boothId = Number(id);
  const p = await getBooth(boothId);
  if (!p || !p.ownerId) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const u = await currentUser();
  const isOwner = !!u && u.id === p.ownerId;
  const days = isOwner && p.tier !== "free" ? 90 : isOwner ? 30 : 7;
  const series = await boothSeries(boothId, days);
  const history = await boothHistory(boothId);
  const referrers = isOwner ? await boothReferrerRows(boothId) : [];
  const all = await claimedBooths();
  const rank = all.filter((x) => x.valueCents > p.valueCents).length + 1;
  const prevRank = await lastWeekRank(boothId);
  return NextResponse.json({ booth: { ...p, isOwner, art: await artFlagsFor(boothId) }, series, totals: sumSeries(series), history, referrers, rank, prevRank });
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
  cloth: z.string().max(9).optional(),
  category: z.string().max(30).optional(),
});

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const { id } = await ctx.params;
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid" }, { status: 400 });
  try {
    const d = { ...parsed.data, logoUrl: parsed.data.logoUrl ?? undefined };
    const booth = await updateBooth(Number(id), u.id, d);
    return NextResponse.json({ booth });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
