"use client";
import { useMemo, useState } from "react";
import { useCity } from "@/lib/city/store";
import { formatCount, formatMoney } from "@/lib/config";
import { PanelHeader } from "./common";

const TABS = [
  { id: "value", label: "Value" },
  { id: "trending", label: "Trending" },
  { id: "visits", label: "Visits" },
  { id: "clicks", label: "Clicks" },
  { id: "newest", label: "New" },
] as const;

export function RankingsPanel() {
  const plots = useCity((s) => s.plots);
  const select = useCity((s) => s.select);
  const setFlyTo = useCity((s) => s.setFlyTo);
  const [tab, setTab] = useState<(typeof TABS)[number]["id"]>("value");
  const rows = useMemo(() => {
    const all = Array.from(plots.values());
    const by = {
      value: (a: typeof all[0], b: typeof all[0]) => b.valueCents - a.valueCents,
      trending: (a: typeof all[0], b: typeof all[0]) => (b.views7d ?? 0) - (a.views7d ?? 0),
      visits: (a: typeof all[0], b: typeof all[0]) => b.totalViews - a.totalViews,
      clicks: (a: typeof all[0], b: typeof all[0]) => b.totalClicks - a.totalClicks,
      newest: (a: typeof all[0], b: typeof all[0]) => (b.claimedAt ?? 0) - (a.claimedAt ?? 0),
    }[tab];
    return all.sort(by).slice(0, 50);
  }, [plots, tab]);
  const metric = (p: (typeof rows)[0]) =>
    tab === "value" ? formatMoney(p.valueCents) : tab === "trending" ? `${formatCount(p.views7d ?? 0)} / 7d` : tab === "visits" ? formatCount(p.totalViews) : tab === "clicks" ? formatCount(p.totalClicks) : formatMoney(p.valueCents);
  return (
    <>
      <PanelHeader title="Rankings" sub="Weekly season resets Monday 00:00 UTC · top 3 trending get featured" />
      <div className="sticky top-[49px] z-10 flex gap-1 border-b border-white/8 bg-[var(--panel)] p-2">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className={`flex-1 rounded-lg px-2 py-1.5 text-xs ${tab === t.id ? "bg-amber-300 text-slate-950 font-semibold" : "bg-white/5 hover:bg-white/10"}`}>{t.label}</button>
        ))}
      </div>
      <ol className="p-2">
        {rows.map((p, i) => (
          <li key={p.id}>
            <button onClick={() => { select(p.id); setFlyTo(p.id); }} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-white/5">
              <span className={`mono w-6 text-sm ${i < 3 ? "text-amber-300 font-bold" : "text-slate-400"}`}>{i + 1}</span>
              <img src={`/api/logo/${p.id}`} alt="" className="h-9 w-9 rounded-lg bg-white/10 object-cover" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{p.name}</span>
                <span className="block truncate text-[11px] text-slate-400">Plot #{p.id} · {p.floors} floors · {formatCount(p.totalViews)} visits · {formatCount(p.totalClicks)} clicks</span>
              </span>
              <span className="mono text-sm text-amber-300">{metric(p)}</span>
            </button>
          </li>
        ))}
      </ol>
    </>
  );
}
