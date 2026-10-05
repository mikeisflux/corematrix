"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/hall/store";
import { formatCount, formatMoney } from "@/lib/config";
import { PanelHeader, Stat } from "./common";

interface S {
  online: number; totalBooths: number; claimed: number; totalSalesCents: number; totalValueCents: number;
  visits: { today: number; yesterday: number; last7d: number; total: number };
  boothViews: { yesterday: number; last7d: number; total: number };
  impressions: { total: number };
  websiteClicks: { today: number; yesterday: number; last7d: number; total: number };
  claims7d: number;
}

export function StatsPanel() {
  const [s, setS] = useState<S | null>(null);
  useEffect(() => {
    api<S>("/api/stats").then(setS);
    const t = setInterval(() => api<S>("/api/stats").then(setS), 15000);
    return () => clearInterval(t);
  }, []);
  if (!s) return <><PanelHeader title="Show statistics" /><p className="p-3 text-xs text-slate-400">Loading…</p></>;
  const row = (label: string, v: { today?: number; yesterday: number; last7d: number; total: number }) => (
    <tr className="border-t border-white/8">
      <td className="py-1.5 pr-2 text-slate-300">{label}</td>
      <td className="mono py-1.5 text-right">{formatCount(v.today ?? 0)}</td>
      <td className="mono py-1.5 text-right">{formatCount(v.yesterday)}</td>
      <td className="mono py-1.5 text-right">{formatCount(v.last7d)}</td>
      <td className="mono py-1.5 text-right text-amber-300">{formatCount(v.total)}</td>
    </tr>
  );
  return (
    <>
      <PanelHeader title="Show statistics" sub="Public numbers, refreshed every 15 seconds" />
      <div className="space-y-3 p-3">
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Online now" value={String(s.online)} sub="connected to the live feed" accent />
          <Stat label="Booths claimed" value={`${s.claimed} / ${s.totalBooths}`} sub={`${s.claims7d} new this week`} />
          <Stat label="Total sales" value={formatMoney(s.totalSalesCents)} />
          <Stat label="Floor value" value={formatMoney(s.totalValueCents)} sub="sum of all booths" />
        </div>
        <table className="w-full text-xs">
          <thead><tr className="text-[10px] uppercase tracking-wider text-slate-500"><th className="text-left font-semibold">Activity</th><th className="text-right font-semibold">Today</th><th className="text-right font-semibold">Yday</th><th className="text-right font-semibold">7d</th><th className="text-right font-semibold">Total</th></tr></thead>
          <tbody>
            {row("Hall visits", s.visits)}
            {row("Booth visits", { yesterday: s.boothViews.yesterday, last7d: s.boothViews.last7d, total: s.boothViews.total })}
            {row("Website clicks", s.websiteClicks)}
          </tbody>
        </table>
        <p className="text-[11px] text-slate-500">Skyline impressions all time: {formatCount(s.impressions.total)}. Owners see their own impressions, uniques, CTR, referrers and conversions in the dashboard.</p>
      </div>
    </>
  );
}
