"use client";
/** The pill at the bottom of the screen while a guided tour runs: which stop you are on, and the controls. */
import { useHall } from "@/lib/hall/store";
import { useTours, nextStop, endTour } from "@/lib/hall/tours";

export function TourBar() {
  const t = useTours();
  const stop = t.tour?.stops[t.index];
  if (!t.active || !t.tour || !stop) return null;
  const last = t.index >= t.tour.stops.length - 1;
  return (
    <div className="pointer-events-auto absolute bottom-[19rem] left-1/2 flex w-max max-w-[calc(100vw-16px)] -translate-x-1/2 flex-col items-center gap-1.5 panel rounded-2xl px-4 py-2 text-sm fade-up md:bottom-24">
      <div className="flex max-w-full items-center gap-2">
        <span className="text-lg">🧭</span>
        <span className="min-w-0 truncate"><b>Tour</b> · stop {t.index + 1} of {t.tour.stops.length} · <b>{stop.label}</b></span>
      </div>
      <div className="max-w-full truncate text-center text-[11px] text-slate-300">
        {t.reached ? stop.blurb : "Follow the line on the floor, or ConBot"}
      </div>
      <div className="flex items-center gap-1.5">
        {stop.boothId != null && t.reached && <button onClick={() => useHall.getState().select(stop.boothId!)} className="btn-ghost px-3 py-1 text-xs">Open booth</button>}
        {t.reached
          ? <button onClick={nextStop} className="btn-primary px-3 py-1 text-xs">{last ? "Finish" : "Next stop"}</button>
          : <button onClick={nextStop} className="btn-ghost px-3 py-1 text-xs text-slate-400" title="Skip this stop">{last ? "Finish" : "Skip"}</button>}
        <button onClick={() => endTour(false)} className="btn-ghost px-3 py-1 text-xs">End</button>
      </div>
    </div>
  );
}
