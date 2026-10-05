"use client";
import { useMemo, useState } from "react";
import { useHall } from "@/lib/hall/store";
import { BOOTH_SIZES, ZONES, formatMoney, type BoothSize } from "@/lib/config";
import { hallLayout, describeSpace } from "@/lib/hall/layout";
import { PanelHeader } from "./common";
import { Designer } from "./Designer";
import { FloorPlan } from "../FloorPlan";

/** Pick a space on the floor plan, then design the booth. Entry point from the big CTA. */
export function ClaimPanel() {
  const booths = useHall((s) => s.booths);
  const setFlyTo = useHall((s) => s.setFlyTo);
  const [picked, setPicked] = useState<number | null>(null);
  const [size, setSize] = useState<BoothSize | null>(null);
  const claimedMap = useMemo(() => new Map(Array.from(booths.values()).map((b) => [b.id, { color: b.color, name: b.name }])), [booths]);
  const available = useMemo(() => hallLayout().filter((b) => !booths.has(b.id) && (!size || b.size === size)), [booths, size]);
  const suggestions = useMemo(() => {
    // one of each zone near the front so the list is a spread, not aisle 100 only
    const byZone = new Map<string, typeof available>();
    for (const b of available) { const arr = byZone.get(b.zone) ?? []; if (arr.length < 6) arr.push(b); byZone.set(b.zone, arr); }
    return ["headliner", "front", "standard", "artist"].flatMap((z) => byZone.get(z) ?? []).slice(0, 18);
  }, [available]);

  if (picked) { const sp = hallLayout().find((b) => b.id === picked)!; return (<><PanelHeader title={`Set up booth ${sp.label}`} sub={describeSpace(sp)} onBack={() => setPicked(null)} /><Designer boothId={picked} mode="claim" /></>); }

  return (
    <>
      <PanelHeader title="Get a booth" sub="Pick a space on the floor plan, then set up your booth" />
      <div className="space-y-3 p-3">
        <ol className="grid grid-cols-3 gap-1 text-[11px] text-slate-300">
          <li className="rounded-lg bg-white/[0.04] p-2"><b className="text-amber-300">1.</b> Pick a space</li>
          <li className="rounded-lg bg-white/[0.04] p-2"><b className="text-amber-300">2.</b> Banner, logo, link</li>
          <li className="rounded-lg bg-white/[0.04] p-2"><b className="text-amber-300">3.</b> Pay, you're live</li>
        </ol>
        <div className="grid grid-cols-2 gap-1">
          {(Object.keys(BOOTH_SIZES) as BoothSize[]).map((k) => (
            <button key={k} onClick={() => setSize(size === k ? null : k)} className={`rounded-xl border p-2 text-left ${size === k ? "border-amber-300 bg-amber-300/10" : "border-white/8 bg-white/[0.03] hover:bg-white/[0.06]"}`}>
              <div className="flex items-center justify-between"><span className="text-sm font-bold">{BOOTH_SIZES[k].short}</span><span className="mono text-xs text-amber-300">from {formatMoney(BOOTH_SIZES[k].priceCents)}</span></div>
              <div className="text-[11px] text-slate-400">{BOOTH_SIZES[k].name}</div>
            </button>
          ))}
        </div>
        <FloorPlan claimed={claimedMap} filterSize={size} onPick={(id) => { if (!booths.has(id)) { setPicked(id); setFlyTo(id); } else { useHall.getState().select(id); setFlyTo(id); } }} onHover={(id) => { if (id) setFlyTo(id); }} height={190} />
        <p className="text-[11px] text-slate-400">{available.length} spaces open{size ? ` at ${BOOTH_SIZES[size].short}` : ""}. Headliner Row (around the arcade) and front-of-house spaces cost more and see the most traffic.</p>
        <ul className="grid grid-cols-2 gap-1.5">
          {suggestions.map((b) => (
            <li key={b.id}>
              <button onMouseEnter={() => setFlyTo(b.id)} onClick={() => setPicked(b.id)} className="flex w-full flex-col rounded-xl border border-white/8 bg-white/[0.03] p-2 text-left hover:border-amber-300/50 hover:bg-white/[0.06]">
                <span className="mono text-sm font-bold">{b.kind === "artist" ? b.label : `Booth ${b.label}`}</span>
                <span className="text-[11px] text-slate-400">{BOOTH_SIZES[b.size].short} · {ZONES[b.zone].name}</span>
                <span className="mono text-xs text-amber-300">{formatMoney(b.priceCents)}</span>
              </button>
            </li>
          ))}
        </ul>
        {available.length === 0 && <p className="text-sm text-slate-300">Sold out at that size. Pick another, or take over an existing booth.</p>}
      </div>
    </>
  );
}
