"use client";
/** Guided tours: pick one and ConBot leads the way, stop by stop, with a route line on the floor. */
import { useMemo } from "react";
import { useHall } from "@/lib/hall/store";
import { PanelHeader } from "./common";
import { buildTours, useTours, startTour, endTour } from "@/lib/hall/tours";

export function ToursPanel() {
  const booths = useHall((s) => s.booths);
  const featured = useHall((s) => s.featured);
  const t = useTours();
  const list = useMemo(() => buildTours(), [booths, featured]); // eslint-disable-line react-hooks/exhaustive-deps -- rebuilt when the hall data changes
  return (
    <>
      <PanelHeader title="Guided tours" sub="ConBot shows you around · a line on the floor leads the way" />
      <div className="space-y-2 p-3">
        {t.active && t.tour && (
          <div className="flex items-center justify-between gap-2 rounded-xl border border-amber-300/50 bg-amber-300/10 p-3 text-sm">
            <span className="min-w-0 truncate">🧭 <b>{t.tour.title}</b> · stop {t.index + 1} of {t.tour.stops.length}</span>
            <button onClick={() => endTour(false)} className="btn-ghost shrink-0 px-3 py-1 text-xs">End tour</button>
          </div>
        )}
        {list.map((tour) => (
          <div key={tour.id} className={`rounded-xl border p-3 ${t.active && t.tour?.id === tour.id ? "border-amber-300/40 bg-amber-300/5" : "border-white/10 bg-white/[0.04]"}`}>
            <div className="flex items-start gap-3">
              <span className="text-xl leading-none">{tour.icon}</span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{tour.title}</div>
                <div className="text-[11px] text-slate-400">{tour.blurb}</div>
                <div className="mt-1 text-[11px] text-slate-400 mono">{tour.stops.length} {tour.stops.length === 1 ? "stop" : "stops"} · {tour.stops.map((s) => s.label).slice(0, 3).join(" · ")}{tour.stops.length > 3 ? " · …" : ""}</div>
              </div>
              <button onClick={() => startTour(tour.id)} className="btn-primary shrink-0 px-3 py-1 text-xs">Start</button>
            </div>
          </div>
        ))}
        <p className="text-[11px] text-slate-400">Starting a tour switches you to walking. Follow the amber line to each stop; once you are there, <b>Next stop</b> moves on and <b>Open booth</b> opens the exhibitor. Share one with <span className="mono">?tour=&lt;id&gt;</span>.</p>
      </div>
    </>
  );
}
