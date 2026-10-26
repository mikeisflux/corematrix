"use client";
/** Live frame-rate readout. Toggle with ?perf=1, the P key, or the gear menu. Session id shown so it can be found in Admin → Performance. */
import { useEffect, useState } from "react";
import { perf } from "@/lib/hall/perf";
import { useHall } from "@/lib/hall/store";
import { getPrefs, setPrefs, usePrefs } from "@/lib/hall/prefs";

export function PerfOverlay() {
  const on = usePrefs().overlay;
  const [, tick] = useState(0);
  const quality = useHall((s) => s.quality);
  useEffect(() => {
    if (new URLSearchParams(location.search).get("perf") === "1") setPrefs({ overlay: true });
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement; if (t?.tagName === "INPUT" || t?.tagName === "TEXTAREA" || t?.isContentEditable) return;
      if (e.key === "p" || e.key === "P") setPrefs({ overlay: !getPrefs().overlay });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => { if (!on) return; const i = setInterval(() => tick((n) => n + 1), 250); return () => clearInterval(i); }, [on]);
  if (!on) return null;
  const d = perf.device;
  const fpsColor = perf.fps >= 50 ? "#5ee6c3" : perf.fps >= 30 ? "#ffcf5c" : "#ff6b6b";
  return (
    <div className="pointer-events-auto absolute right-16 top-3 z-40 w-[290px] rounded-xl border border-white/10 bg-slate-950/85 p-3 font-mono text-[11px] text-slate-300 backdrop-blur">
      <div className="flex items-baseline justify-between"><span className="text-[10px] font-bold uppercase tracking-wider text-amber-300">Performance</span><span className="text-[10px] text-slate-500">P to hide</span></div>
      <div className="mt-1 flex items-baseline gap-2"><span className="text-3xl font-bold" style={{ color: fpsColor }}>{perf.fps}</span><span>fps</span><span className="ml-auto">{perf.ms.toFixed(1)} ms · p95 {perf.p95.toFixed(1)}</span></div>
      <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5">
        <span>main thread</span><span className="text-right text-white">{perf.cpu.toFixed(1)} ms <span className="text-slate-400">(render {perf.rend.toFixed(1)})</span></span>
        <span>draw calls</span><span className="text-right text-white">{perf.calls}</span>
        <span>triangles</span><span className="text-right text-white">{perf.tris.toLocaleString("en-US")}</span>
        <span>quality / dpr</span><span className="text-right text-white">{quality} / {(window.devicePixelRatio || 1).toFixed(2)}</span>
        <span>crowd</span><span className="text-right text-white">{perf.npcs}</span>
        <span>long frames</span><span className="text-right text-white">{perf.longFrames} / {perf.frames}</span>
      </div>
      {d && <div className="mt-2 truncate border-t border-white/10 pt-2 text-[10px] text-slate-400" title={d.gpu}>{d.gpu}</div>}
      <div className="mt-1 text-[10px] text-slate-500">session <span className="text-slate-300">{perf.sessionId}</span> · saved every 10 s</div>
    </div>
  );
}
