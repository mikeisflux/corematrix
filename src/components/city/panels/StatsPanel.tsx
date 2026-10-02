"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/city/store";
import { formatCount, formatMoney } from "@/lib/config";
import { PanelHeader, Stat } from "./common";

interface S {
  online: number; totalPlots: number; claimed: number; totalSalesCents: number; totalValueCents: number;
  visits: { today: number; yesterday: number; last7d: number; total: number };
  buildingViews: { yesterday: number; last7d: number; total: number };
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
  if (!s) return <><PanelHeader title="City statistics" /><p className="p-3 text-xs text-slate-400">Loading…</p></>;
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
      <PanelHeader title="City statistics" sub="Public numbers, refreshed every 15 seconds" />
      <div className="space-y-3 p-3">
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Online now" value={String(s.online)} sub="connected to the live feed" accent />
          <Stat label="Plots claimed" value={`${s.claimed} / ${s.totalPlots}`} sub={`${s.claims7d} new this week`} />
          <Stat label="Total sales" value={formatMoney(s.totalSalesCents)} />
          <Stat label="Skyline value" value={formatMoney(s.totalValueCents)} sub="sum of all buildings" />
        </div>
        <table className="w-full text-xs">
          <thead><tr className="text-[10px] uppercase tracking-wider text-slate-500"><th className="text-left font-semibold">Activity</th><th className="text-right font-semibold">Today</th><th className="text-right font-semibold">Yday</th><th className="text-right font-semibold">7d</th><th className="text-right font-semibold">Total</th></tr></thead>
          <tbody>
            {row("Avenue visits", s.visits)}
            {row("Building views", { yesterday: s.buildingViews.yesterday, last7d: s.buildingViews.last7d, total: s.buildingViews.total })}
            {row("Website clicks", s.websiteClicks)}
          </tbody>
        </table>
        <p className="text-[11px] text-slate-500">Skyline impressions all time: {formatCount(s.impressions.total)}. Owners see their own impressions, uniques, CTR, referrers and conversions in the dashboard.</p>
      </div>
    </>
  );
}
