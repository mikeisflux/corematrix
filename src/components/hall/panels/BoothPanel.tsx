"use client";
import { useEffect, useState } from "react";
import { api, track, useHall } from "@/lib/hall/store";
import { CATEGORIES, formatCount, formatMoney, splitTakeover, BOOTH_SIZES, ZONES } from "@/lib/config";
import { boothSpace, describeSpace } from "@/lib/hall/layout";
import { PanelHeader } from "./common";
import { Designer } from "./Designer";
import { Storefront, type StorefrontDetail } from "./Storefront";

interface Detail extends StorefrontDetail {
  booth: StorefrontDetail["booth"] & { totalClicks: number; totalImpressions: number };
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
    // clicking A then B quickly: only B's storefront may land (A's links and art on B's covers otherwise)
    let on = true;
    api<Detail>(`/api/booth/${id}`).then((d) => { if (on) setDetail(d); }).catch(() => null);
    return () => { on = false; };
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
  if (view === "takeover" && !booth.house) return (<><PanelHeader title={`Take over booth ${space.label}`} sub={booth.name ?? ""} onBack={() => setView("view")} /><Designer boothId={id} mode="takeover" /></>);
  const ctr = detail && detail.totals.views ? ((detail.totals.clicks / detail.totals.views) * 100).toFixed(1) : "0.0";

  return (
    <>
      <PanelHeader title={space.kind === "artist" ? `Table ${space.label}` : `Booth ${space.label}`} sub={`${describeSpace(space)} · rank #${rank}`} />
      <Storefront id={id} booth={booth} detail={detail} rank={rank} onTakeover={() => setView("takeover")} />
    </>
  );
}
