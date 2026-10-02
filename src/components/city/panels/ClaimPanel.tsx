"use client";
import { useMemo, useState } from "react";
import { useCity } from "@/lib/city/store";
import { formatMoney, PRICE_PER_FLOOR_CENTS, TOTAL_PLOTS, zoneFor } from "@/lib/config";
import { PanelHeader } from "./common";
import { Designer } from "./Designer";

/** Pick a plot, then design it. Also the entry point from the big CTA. */
export function ClaimPanel() {
  const plots = useCity((s) => s.plots);
  const setFlyTo = useCity((s) => s.setFlyTo);
  const [picked, setPicked] = useState<number | null>(null);
  const [filter, setFilter] = useState<"all" | "cheap" | "prime">("all");
  const available = useMemo(() => {
    const out: number[] = [];
    for (let i = 1; i <= TOTAL_PLOTS && out.length < 60; i++) {
      if (plots.has(i)) continue;
      const z = zoneFor(i);
      if (filter === "cheap" && z.minFloors > 1) continue;
      if (filter === "prime" && z.minFloors === 1) continue;
      out.push(i);
    }
    return out;
  }, [plots, filter]);

  if (picked) return (<><PanelHeader title={`Design Plot #${picked}`} sub={zoneFor(picked).name} onBack={() => setPicked(null)} /><Designer plotId={picked} mode="claim" /></>);

  return (
    <>
      <PanelHeader title="Claim a plot" sub="Pick an address, then design your building" />
      <div className="space-y-3 p-3">
        <ol className="grid grid-cols-3 gap-1 text-[11px] text-slate-300">
          <li className="rounded-lg bg-white/[0.04] p-2"><b className="text-amber-300">1.</b> Pick a plot</li>
          <li className="rounded-lg bg-white/[0.04] p-2"><b className="text-amber-300">2.</b> Choose height & look</li>
          <li className="rounded-lg bg-white/[0.04] p-2"><b className="text-amber-300">3.</b> Pay, go live instantly</li>
        </ol>
        <div className="flex gap-1">
          {(["all", "cheap", "prime"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`rounded-lg px-3 py-1 text-xs capitalize ${filter === f ? "bg-amber-300 text-slate-950 font-semibold" : "bg-white/5"}`}>{f === "cheap" ? "From $5" : f === "prime" ? "Prime zones" : "All"}</button>
          ))}
        </div>
        <ul className="grid grid-cols-2 gap-1.5">
          {available.map((id) => {
            const z = zoneFor(id);
            return (
              <li key={id}>
                <button onMouseEnter={() => setFlyTo(id)} onClick={() => setPicked(id)} className="flex w-full flex-col rounded-xl border border-white/8 bg-white/[0.03] p-2 text-left hover:border-amber-300/50 hover:bg-white/[0.06]">
                  <span className="mono text-sm font-bold">Plot #{id}</span>
                  <span className="text-[11px] text-slate-400">{z.name}</span>
                  <span className="mono text-xs text-amber-300">from {formatMoney(z.minFloors * PRICE_PER_FLOOR_CENTS)}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {available.length === 0 && <p className="text-sm text-slate-300">Nothing matches. Try another filter, or take over an existing building.</p>}
      </div>
    </>
  );
}
