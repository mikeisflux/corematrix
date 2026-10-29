import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { getBooth, boothHistory, updateBooth } from "@/lib/economy";
import { artFlagsFor, artLinksFor } from "@/lib/art";
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
  if (p.hidden && !isOwner) return NextResponse.json({ error: "Not found" }, { status: 404 }); // hidden by an admin
  const days = isOwner && p.tier !== "free" ? 90 : isOwner ? 30 : 7;
  const series = await boothSeries(boothId, days);
  const history = await boothHistory(boothId);
  const referrers = isOwner ? await boothReferrerRows(boothId) : [];
  const all = await claimedBooths();
  const rank = all.filter((x) => x.valueCents > p.valueCents).length + 1;
  const prevRank = await lastWeekRank(boothId);
  // a visitor sees the shop window, not the books: no payment, customer or subscription details
  // (and no 1.5 MB logo blob on every storefront open: /api/logo/<id> serves it)
  const { subscriptionId: _sub, subscriptionStatus: _ss, tierUntil: _tu, teamId: _team, hidden: _h, lastTakeoverNudgeAt: _n, ...rest } = p as typeof p & { lastTakeoverNudgeAt?: number | null };
  const pub = { ...rest, logoUrl: p.logoUrl?.startsWith("data:") ? `/api/logo/${p.id}?v=${p.updatedAt ?? 0}` : p.logoUrl };
  const historyOut = history.map((h) => ({ id: h.id, kind: h.kind, amountCents: h.amountCents, valueBefore: h.valueBefore, valueAfter: h.valueAfter, createdAt: h.createdAt, ...(isOwner ? { sellerPayoutCents: h.sellerPayoutCents } : {}) }));
  return NextResponse.json({ booth: { ...(isOwner ? p : pub), isOwner, art: await artFlagsFor(boothId), artLinks: await artLinksFor(boothId) }, series, totals: sumSeries(series), history: historyOut, referrers, rank, prevRank });
}

const Patch = z.object({
  name: z.string().max(60).optional(),
  tagline: z.string().max(120).optional(),
  description: z.string().max(800).optional(),
  website: z.string().max(300).optional(),
  artstation: z.string().max(300).optional(),
  deviantart: z.string().max(300).optional(),
  instagram: z.string().max(300).optional(),
  xUrl: z.string().max(300).optional(),
  facebook: z.string().max(300).optional(),
  globalcomix: z.string().max(300).optional(),
  logoUrl: z.string().max(1_500_000).nullable().optional(),
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
