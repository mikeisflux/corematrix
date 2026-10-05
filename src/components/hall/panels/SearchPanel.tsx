"use client";
import { useMemo, useState } from "react";
import { useHall } from "@/lib/hall/store";
import { CATEGORIES, formatMoney } from "@/lib/config";
import { PanelHeader } from "./common";

export function SearchPanel() {
  const booths = useHall((s) => s.booths);
  const select = useHall((s) => s.select);
  const setFlyTo = useHall((s) => s.setFlyTo);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return Array.from(booths.values())
      .filter((p) => (!category || p.category === category) && (!needle || p.name?.toLowerCase().includes(needle) || p.tagline?.toLowerCase().includes(needle) || String(p.id) === needle.replace("#", "")))
      .sort((a, b) => b.valueCents - a.valueCents)
      .slice(0, 40);
  }, [booths, q, category]);
  return (
    <>
      <PanelHeader title="Find an exhibitor" sub={`${booths.size} booths on the floor`} />
      <div className="space-y-2 p-3">
        <input autoFocus className="input" placeholder="Name, tagline or booth number" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="flex flex-wrap gap-1">
          <button onClick={() => setCategory("")} className={`rounded-lg px-2 py-1 text-[11px] ${!category ? "bg-amber-300 text-slate-950" : "bg-white/5"}`}>All categorys</button>
          {Object.entries(CATEGORIES).map(([k, v]: [string, { name: string }]) => (
            <button key={k} onClick={() => setCategory(k)} className={`rounded-lg px-2 py-1 text-[11px] ${category === k ? "bg-amber-300 text-slate-950" : "bg-white/5"}`}>{v.name}</button>
          ))}
        </div>
        <ul>
          {rows.map((p) => (
            <li key={p.id}>
              <button onClick={() => { select(p.id); setFlyTo(p.id); }} className="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left hover:bg-white/5">
                <img src={`/api/logo/${p.id}`} alt="" className="h-8 w-8 rounded-lg bg-white/10 object-cover" />
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{p.name}</span><span className="block truncate text-[11px] text-slate-400">Booth #{p.id} · {CATEGORIES[p.category]?.name}</span></span>
                <span className="mono text-xs text-amber-300">{formatMoney(p.valueCents)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
