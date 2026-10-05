"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, track, useHall } from "@/lib/hall/store";
import { CATEGORIES, formatCount, formatMoney, splitTakeover, BOOTH_SIZES, ZONES } from "@/lib/config";
import { boothSpace, describeSpace } from "@/lib/hall/layout";
import { timeAgo } from "@/lib/util";
import { PanelHeader, Stat } from "./common";
import { Designer } from "./Designer";
import { openSite } from "../Booth";
import { Sparkline } from "@/components/ui/Sparkline";

interface Detail {
  booth: { isOwner: boolean; description: string | null; claimedAt: number | null; salesCount: number; totalClicks: number; totalImpressions: number };
  series: Array<{ day: string; views: number; clicks: number; impressions: number }>;
  totals: { views: number; clicks: number; impressions: number; uniques: number };
  history: Array<{ id: string; kind: string; amountCents: number; valueAfter: number; createdAt: number }>;
}

export function BoothPanel() {
  const id = useHall((s) => s.selected);
  const booth = useHall((s) => (s.selected ? s.booths.get(s.selected) : undefined));
  const booths = useHall((s) => s.booths);
  const me = useHall((s) => s.me);
  const mode = useHall((s) => s.mode);
  const setMode = useHall((s) => s.setMode);
  const setFlyTo = useHall((s) => s.setFlyTo);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [view, setView] = useState<"view" | "claim" | "takeover">("view");

  useEffect(() => {
    setView("view"); setDetail(null);
    if (!id || !booth) return;
    track({ kind: "views", boothId: id, source: mode === "walk" ? "walk" : "map" });
    api<Detail>(`/api/booth/${id}`).then(setDetail).catch(() => null);
  }, [id, booth?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!id) return null;
  const space = boothSpace(id);
  if (!space) return null;

  if (!booth) {
    if (view === "claim") return (<><PanelHeader title={`Set up booth ${space.label}`} sub={describeSpace(space)} onBack={() => setView("view")} /><Designer boothId={id} mode="claim" /></>);
    return (
      <>
        <PanelHeader title="Open space" sub={describeSpace(space)} />
        <div className="space-y-3 p-3">
          <div className="rounded-xl bg-white/[0.04] p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{BOOTH_SIZES[space.size].name} · {ZONES[space.zone].name}</div>
            <div className="mono text-3xl font-bold text-amber-300">{formatMoney(space.priceCents)}</div>
            <p className="mt-1 text-xs text-slate-300">{BOOTH_SIZES[space.size].blurb} {ZONES[space.zone].blurb}</p>
          </div>
          <button className="btn-primary w-full" onClick={() => setView("claim")}>Set up & claim this space →</button>
          <ul className="space-y-1 text-xs text-slate-300">
            <li>✓ Permanent booth number: <span className="mono">{space.label}</span></li>
            <li>✓ Banner with your logo, tagline and link (opens in a new tab)</li>
            <li>✓ Impressions, visits, clicks and conversions tracked</li>
            <li>✓ Shareable card + embeddable badge</li>
          </ul>
        </div>
      </>
    );
  }

  const rank = Array.from(booths.values()).filter((p) => p.valueCents > booth.valueCents).length + 1;
  const { price, sellerPayout } = splitTakeover(booth.valueCents);
  const isOwner = me && detail?.booth.isOwner;
  if (view === "takeover") return (<><PanelHeader title={`Take over booth ${space.label}`} sub={booth.name ?? ""} onBack={() => setView("view")} /><Designer boothId={id} mode="takeover" /></>);
  const ctr = detail && detail.totals.views ? ((detail.totals.clicks / detail.totals.views) * 100).toFixed(1) : "0.0";

  return (
    <>
      <PanelHeader title={space.kind === "artist" ? `Table ${space.label}` : `Booth ${space.label}`} sub={`${describeSpace(space)} · rank #${rank}`} />
      <div className="space-y-3 p-3">
        <div className="flex items-start gap-3">
          <img src={`/api/logo/${id}`} alt="" className="h-16 w-16 rounded-xl bg-white/10 object-cover" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-lg font-bold">{booth.name}</h2>
              {booth.tier !== "free" && <span className="rounded-full bg-amber-300/20 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-300">{booth.tier === "landmark" ? "Headliner" : booth.tier}</span>}
            </div>
            {booth.tagline && <p className="text-sm text-slate-300">{booth.tagline}</p>}
            <p className="text-[11px] text-slate-500">{CATEGORIES[booth.category]?.name ?? booth.category} · {BOOTH_SIZES[space.size]?.short}</p>
            {detail?.booth.description && <p className="mt-1 text-xs text-slate-400 line-clamp-3">{detail.booth.description}</p>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {booth.website ? <button className="btn-ghost" onClick={() => openSite(id, booth.website, mode === "walk" ? "walk" : "panel")}>🌐 Visit website ↗</button> : <span className="btn-ghost opacity-50">No website yet</span>}
          <Stat label="Value" value={formatMoney(booth.valueCents)} accent />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Visits (7d)" value={formatCount(detail?.totals.views ?? 0)} sub={`${formatCount(booth.totalViews)} all time`} />
          <Stat label="Clicks (7d)" value={formatCount(detail?.totals.clicks ?? 0)} sub={`${ctr}% CTR`} />
          <Stat label="Seen on floor" value={formatCount(detail?.totals.impressions ?? 0)} sub="7 days" />
        </div>
        {detail && (
          <div className="rounded-xl bg-white/[0.04] p-2">
            <div className="flex items-center justify-between px-1 text-[10px] uppercase tracking-wider text-slate-400"><span>Visits, last 7 days</span><span>{detail.series.at(-1)?.views ?? 0} today</span></div>
            <Sparkline values={detail.series.map((r) => r.views)} width={320} height={44} />
          </div>
        )}
        {isOwner ? (
          <div className="space-y-2">
            <Link href={`/dashboard?booth=${id}`} className="btn-primary w-full">Manage · analytics, edit, boost →</Link>
            <p className="text-center text-[11px] text-slate-400">This is your booth. Takeover price for others: {formatMoney(price)}.</p>
          </div>
        ) : (
          <div className="space-y-2">
            <button className="btn-primary w-full" onClick={() => { track({ kind: "takeover_view", boothId: id }); setView("takeover"); }}>Take over for {formatMoney(price)} →</button>
            <p className="text-center text-[11px] text-slate-400">Current owner would receive {formatMoney(sellerPayout)} ({formatMoney(sellerPayout - booth.valueCents)} profit).</p>
          </div>
        )}
        <div className="flex gap-2">
          <button className="btn-ghost flex-1 text-xs" onClick={() => { if (mode !== "walk") setMode("walk"); setFlyTo(id); useHall.getState().setPanel("none"); }}>🚶 Walk here</button>
          <Link href={`/booth/${id}`} className="btn-ghost flex-1 text-xs">Public page</Link>
          <button className="btn-ghost flex-1 text-xs" onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}/booth/${id}`); useHall.getState().setToast("Link copied"); }}>Copy link</button>
          <a className="btn-ghost flex-1 text-xs" target="_blank" rel="noopener" href={`https://x.com/intent/post?text=${encodeURIComponent(`${booth.name} is exhibiting at ForeverComicCon, booth ${space.label}`)}&url=${encodeURIComponent(`${typeof window !== "undefined" ? window.location.origin : ""}/booth/${id}`)}`}>Share</a>
        </div>
        {detail && detail.history.length > 0 && (
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Ownership history</div>
            <ul className="mt-1 space-y-1 text-xs">
              {detail.history.slice(-5).reverse().map((h) => (
                <li key={h.id} className="flex justify-between rounded-lg bg-white/[0.03] px-2 py-1"><span className="capitalize text-slate-300">{h.kind}</span><span className="mono">{formatMoney(h.valueAfter)} <span className="text-slate-500">· {timeAgo(h.createdAt)}</span></span></li>
              ))}
            </ul>
          </div>
        )}
        <p className="text-[11px] text-slate-500">Claimed {booth.claimedAt ? timeAgo(booth.claimedAt) : "recently"} · changed hands {Math.max(0, booth.salesCount - 1)}×</p>
      </div>
    </>
  );
}
