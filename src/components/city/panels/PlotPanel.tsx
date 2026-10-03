"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { api, track, useCity } from "@/lib/city/store";
import { DISTRICTS, formatCount, formatMoney, splitTakeover, zoneFor, PRICE_PER_FLOOR_CENTS } from "@/lib/config";
import { timeAgo } from "@/lib/util";
import { PanelHeader, Stat } from "./common";
import { Designer } from "./Designer";
import { Sparkline } from "@/components/ui/Sparkline";

interface Detail {
  plot: { isOwner: boolean; description: string | null; claimedAt: number | null; salesCount: number; floors: number; totalClicks: number; totalImpressions: number };
  series: Array<{ day: string; views: number; clicks: number; impressions: number }>;
  totals: { views: number; clicks: number; impressions: number; uniques: number };
  history: Array<{ id: string; kind: string; amountCents: number; valueAfter: number; createdAt: number }>;
}

export function PlotPanel() {
  const id = useCity((s) => s.selected);
  const plot = useCity((s) => (s.selected ? s.plots.get(s.selected) : undefined));
  const plots = useCity((s) => s.plots);
  const me = useCity((s) => s.me);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [mode, setMode] = useState<"view" | "claim" | "takeover">("view");

  useEffect(() => {
    setMode("view");
    setDetail(null);
    if (!id || !plot) return;
    track({ kind: "views", plotId: id, source: "skyline" });
    api<Detail>(`/api/plot/${id}`).then(setDetail).catch(() => null);
  }, [id, plot?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!id) return null;

  if (!plot) {
    const z = zoneFor(id);
    if (mode === "claim") return (<><PanelHeader title={`Design Plot #${id}`} sub={z.name} onBack={() => setMode("view")} /><Designer plotId={id} mode="claim" /></>);
    return (
      <>
        <PanelHeader title="Available plot" sub={`Plot #${id} · ${z.name}`} />
        <div className="space-y-3 p-3">
          <div className="rounded-xl bg-white/[0.04] p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Starting price</div>
            <div className="mono text-3xl font-bold text-amber-300">{formatMoney(z.minFloors * PRICE_PER_FLOOR_CENTS)}</div>
            <p className="mt-1 text-xs text-slate-300">{z.blurb} Each floor adds {formatMoney(PRICE_PER_FLOOR_CENTS)}. Taller buildings rank higher and get more impressions.</p>
          </div>
          <button className="btn-primary w-full" onClick={() => setMode("claim")}>Design & claim this plot →</button>
          <ul className="space-y-1 text-xs text-slate-300">
            <li>✓ Permanent address: <span className="mono">/plot/{id}</span></li>
            <li>✓ Logo, link and tagline on the skyline</li>
            <li>✓ Impressions, visits, clicks and conversions tracked</li>
            <li>✓ Shareable card + embeddable badge</li>
          </ul>
        </div>
      </>
    );
  }

  const rank = Array.from(plots.values()).filter((p) => p.valueCents > plot.valueCents).length + 1;
  const { price, sellerPayout } = splitTakeover(plot.valueCents);
  const isOwner = me && detail?.plot.isOwner;

  if (mode === "takeover") return (<><PanelHeader title={`Take over Plot #${id}`} sub={plot.name ?? ""} onBack={() => setMode("view")} /><Designer plotId={id} mode="takeover" /></>);

  const ctr = detail && detail.totals.views ? ((detail.totals.clicks / detail.totals.views) * 100).toFixed(1) : "0.0";

  return (
    <>
      <PanelHeader title={`Plot #${id}`} sub={`${DISTRICTS[plot.district]?.name ?? plot.district} · rank #${rank} · ${detail?.plot.floors ?? plot.floors} floors`} />
      <div className="space-y-3 p-3">
        <div className="flex items-start gap-3">
          <img src={`/api/logo/${id}`} alt="" className="h-16 w-16 rounded-xl bg-white/10 object-cover" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-lg font-bold">{plot.name}</h2>
              {plot.tier !== "free" && <span className="rounded-full bg-amber-300/20 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-300">{plot.tier}</span>}
            </div>
            {plot.tagline && <p className="text-sm text-slate-300">{plot.tagline}</p>}
            {detail?.plot.description && <p className="mt-1 text-xs text-slate-400 line-clamp-3">{detail.plot.description}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {plot.website ? (
            <a href={`/go/${id}?src=skyline`} target="_blank" rel="noopener" className="btn-ghost" onClick={() => track({ kind: "hovers", plotId: id })}>🌐 Visit website</a>
          ) : (
            <span className="btn-ghost opacity-50">No website yet</span>
          )}
          <Stat label="Value" value={formatMoney(plot.valueCents)} accent />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Stat label="Visits (7d)" value={formatCount(detail?.totals.views ?? 0)} sub={`${formatCount(plot.totalViews)} all time`} />
          <Stat label="Clicks (7d)" value={formatCount(detail?.totals.clicks ?? 0)} sub={`${ctr}% CTR`} />
          <Stat label="Seen on skyline" value={formatCount(detail?.totals.impressions ?? 0)} sub="7 days" />
        </div>
        {detail && (
          <div className="rounded-xl bg-white/[0.04] p-2">
            <div className="flex items-center justify-between px-1 text-[10px] uppercase tracking-wider text-slate-400"><span>Visits, last 7 days</span><span>{detail.series.at(-1)?.views ?? 0} today</span></div>
            <Sparkline values={detail.series.map((r) => r.views)} width={320} height={44} />
          </div>
        )}

        {isOwner ? (
          <div className="space-y-2">
            <Link href={`/dashboard?plot=${id}`} className="btn-primary w-full">Manage · analytics, edit, boost →</Link>
            <p className="text-center text-[11px] text-slate-400">This is your building. Takeover price for others: {formatMoney(price)}.</p>
          </div>
        ) : (
          <div className="space-y-2">
            <button className="btn-primary w-full" onClick={() => { track({ kind: "takeover_view", plotId: id }); setMode("takeover"); }}>Take over for {formatMoney(price)} →</button>
            <p className="text-center text-[11px] text-slate-400">Current owner would receive {formatMoney(sellerPayout)} ({formatMoney(sellerPayout - plot.valueCents)} profit).</p>
          </div>
        )}

        <div className="flex gap-2">
          <Link href={`/plot/${id}`} className="btn-ghost flex-1 text-xs">Public page</Link>
          <button className="btn-ghost flex-1 text-xs" onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}/plot/${id}`); useCity.getState().setToast("Link copied"); }}>Copy link</button>
          <a className="btn-ghost flex-1 text-xs" target="_blank" rel="noopener" href={`https://x.com/intent/post?text=${encodeURIComponent(`${plot.name} is on the skyline at Plot #${id}`)}&url=${encodeURIComponent(`${typeof window !== "undefined" ? window.location.origin : ""}/plot/${id}`)}`}>Share on X</a>
        </div>

        {detail && detail.history.length > 0 && (
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Ownership history</div>
            <ul className="mt-1 space-y-1 text-xs">
              {detail.history.slice(-5).reverse().map((h) => (
                <li key={h.id} className="flex justify-between rounded-lg bg-white/[0.03] px-2 py-1">
                  <span className="capitalize text-slate-300">{h.kind}</span>
                  <span className="mono">{formatMoney(h.valueAfter)} <span className="text-slate-500">· {timeAgo(h.createdAt)}</span></span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="text-[11px] text-slate-500">Claimed {plot.claimedAt ? timeAgo(plot.claimedAt) : "recently"} · changed hands {Math.max(0, plot.salesCount - 1)}×</p>
      </div>
    </>
  );
}
