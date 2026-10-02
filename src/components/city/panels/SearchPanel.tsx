"use client";
import { useMemo, useState } from "react";
import { useCity } from "@/lib/city/store";
import { DISTRICTS, formatMoney } from "@/lib/config";
import { PanelHeader } from "./common";

export function SearchPanel() {
  const plots = useCity((s) => s.plots);
  const select = useCity((s) => s.select);
  const setFlyTo = useCity((s) => s.setFlyTo);
  const [q, setQ] = useState("");
  const [district, setDistrict] = useState("");
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return Array.from(plots.values())
      .filter((p) => (!district || p.district === district) && (!needle || p.name?.toLowerCase().includes(needle) || p.tagline?.toLowerCase().includes(needle) || String(p.id) === needle.replace("#", "")))
      .sort((a, b) => b.valueCents - a.valueCents)
      .slice(0, 40);
  }, [plots, q, district]);
  return (
    <>
      <PanelHeader title="Find a building" sub={`${plots.size} buildings on the avenue`} />
      <div className="space-y-2 p-3">
        <input autoFocus className="input" placeholder="Name, tagline or plot number" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="flex flex-wrap gap-1">
          <button onClick={() => setDistrict("")} className={`rounded-lg px-2 py-1 text-[11px] ${!district ? "bg-amber-300 text-slate-950" : "bg-white/5"}`}>All districts</button>
          {Object.entries(DISTRICTS).map(([k, v]) => (
            <button key={k} onClick={() => setDistrict(k)} className={`rounded-lg px-2 py-1 text-[11px] ${district === k ? "bg-amber-300 text-slate-950" : "bg-white/5"}`}>{v.name}</button>
          ))}
        </div>
        <ul>
          {rows.map((p) => (
            <li key={p.id}>
              <button onClick={() => { select(p.id); setFlyTo(p.id); }} className="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left hover:bg-white/5">
                <img src={`/api/logo/${p.id}`} alt="" className="h-8 w-8 rounded-lg bg-white/10 object-cover" />
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{p.name}</span><span className="block truncate text-[11px] text-slate-400">Plot #{p.id} · {DISTRICTS[p.district]?.name}</span></span>
                <span className="mono text-xs text-amber-300">{formatMoney(p.valueCents)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
