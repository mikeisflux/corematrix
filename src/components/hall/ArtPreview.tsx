"use client";
/** The full-size cover or print a visitor is holding the mouse on (see lib/hall/preview.ts), and the little progress pill while the hold runs. Not interactive: the pointer stays on the table. */
import { useEffect, useState } from "react";
import { usePreview } from "@/lib/hall/preview";

export function ArtPreview() {
  const pv = usePreview();
  const [, tick] = useState(0);
  // the pill fills over the hold: redraw it a few times a second while it runs
  useEffect(() => { if (!pv.holding) return; const t = setInterval(() => tick((n) => n + 1), 80); return () => clearInterval(t); }, [pv.holding]);
  if (pv.holding) {
    const pct = Math.min(100, Math.round(((Date.now() - pv.holding.since) / (pv.holding.until - pv.holding.since)) * 100));
    return (
      <div data-art-hold className="pointer-events-none absolute bottom-28 left-1/2 z-40 -translate-x-1/2 rounded-full border border-white/15 bg-slate-950/85 px-3 py-1.5 text-[11px] text-slate-200 shadow-lg md:bottom-10">
        <div className="flex items-center gap-2"><span>Hold still to see it big</span><span className="h-1.5 w-20 overflow-hidden rounded-full bg-white/10"><span className="block h-full bg-amber-300 transition-[width] duration-75" style={{ width: `${pct}%` }} /></span></div>
      </div>
    );
  }
  if (!pv.url) return null;
  return (
    <div data-art-preview className="pointer-events-none absolute inset-0 z-[60] flex flex-col items-center justify-center bg-black/60 fade-up">
      <img src={pv.url} alt={pv.caption} className="max-h-[78vh] max-w-[min(90vw,900px)] rounded-xl object-contain shadow-2xl" />
      <div className="mt-3 rounded-full bg-black/70 px-4 py-1.5 text-sm text-slate-100">{pv.caption} <span className="text-slate-400">· move the mouse away to close</span></div>
    </div>
  );
}
