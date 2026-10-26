"use client";
/** The gear menu: graphics, controls, the performance overlay/capture, and exports of this visit's stats. */
import { useState } from "react";
import { useHall } from "@/lib/hall/store";
import { usePrefs, setPrefs, resetPrefs, type Prefs } from "@/lib/hall/prefs";
import { perf, perfSnapshot, perfText, downloadText } from "@/lib/hall/perf";
import { PanelHeader } from "./common";

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0"><div className="text-sm">{label}</div>{hint && <div className="text-[11px] text-slate-400">{hint}</div>}</div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
function Seg<T extends string>({ value, options, onChange }: { value: T; options: { v: T; l: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-lg border border-white/10 bg-white/5 p-0.5 text-[11px]">
      {options.map((o) => <button key={o.v} onClick={() => onChange(o.v)} className={`rounded-md px-2 py-1 ${value === o.v ? "bg-amber-300 font-bold text-slate-900" : "text-slate-300 hover:bg-white/10"}`}>{o.l}</button>)}
    </div>
  );
}
function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return <button role="switch" aria-checked={on} onClick={() => onChange(!on)} className={`relative h-5 w-9 rounded-full transition ${on ? "bg-amber-300" : "bg-white/15"}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${on ? "left-[18px]" : "left-0.5"}`} /></button>;
}

export function SettingsPanel() {
  const p = usePrefs();
  const night = useHall((s) => s.night);
  const toggleNight = useHall((s) => s.toggleNight);
  const quality = useHall((s) => s.quality);
  const setToast = useHall((s) => s.setToast);
  const [copied, setCopied] = useState(false);
  const set = (patch: Partial<Prefs>) => setPrefs(patch);
  const stamp = () => new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const exportJson = () => downloadText(`fcc-perf-${perf.sessionId || stamp()}.json`, JSON.stringify(perfSnapshot(), null, 2));
  const exportCsv = () => {
    const cols = ["t", "f", "avg", "p95", "max", "cpu", "rend", "calls", "tris", "mode", "q", "npc", "dpr", "long"] as const;
    const body = [cols.join(","), ...perf.history.map((b) => cols.map((c) => b[c] ?? "").join(","))].join("\n");
    downloadText(`fcc-perf-${perf.sessionId || stamp()}.csv`, body, "text/csv");
  };
  const copyReport = async () => {
    try { await navigator.clipboard.writeText(perfText()); setCopied(true); setTimeout(() => setCopied(false), 2000); }
    catch { setToast("Copy failed; use Export JSON instead"); }
  };
  const secs = perf.history.length;
  return (
    <>
      <PanelHeader title="Settings" sub="Saved on this device" />
      <div className="divide-y divide-white/8 px-3 pb-3">
        <div className="py-2">
          <div className="pt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Graphics</div>
          <Row label="Quality" hint={p.quality === "auto" ? `Auto picks a tier from your frame rate (now ${quality})` : "Locked; the frame-rate monitor is off"}>
            <Seg value={p.quality} options={[{ v: "auto", l: "Auto" }, { v: "high", l: "High" }, { v: "medium", l: "Med" }, { v: "low", l: "Low" }]} onChange={(v) => set({ quality: v })} />
          </Row>
          <Row label="Crowd" hint="Fewer people on the floor means more frames">
            <Seg value={p.crowd} options={[{ v: "full", l: "Full" }, { v: "light", l: "Light" }, { v: "none", l: "None" }]} onChange={(v) => set({ crowd: v })} />
          </Row>
          <Row label="After hours" hint="Night lighting with the neon up"><Toggle on={night} onChange={toggleNight} /></Row>
        </div>
        <div className="py-2">
          <div className="pt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Controls</div>
          <Row label="Mouse look speed" hint={`${p.sensitivity.toFixed(1)}×`}>
            <input type="range" min={0.3} max={3} step={0.1} value={p.sensitivity} onChange={(e) => set({ sensitivity: Number(e.target.value) })} className="w-32 accent-amber-300" />
          </Row>
          <Row label="Invert vertical look"><Toggle on={p.invertY} onChange={(v) => set({ invertY: v })} /></Row>
          <div className="mono pt-1 text-[11px] text-slate-400">arrows / WASD walk · Q E turn · shift run · V first person · E open booth · P stats overlay</div>
        </div>
        <div className="py-2">
          <div className="pt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Performance</div>
          <Row label="Show frame-rate overlay" hint="fps, frame time, draw calls, triangles"><Toggle on={p.overlay} onChange={(v) => set({ overlay: v })} /></Row>
          <Row label="Send stats to the show" hint="1-second samples so slow machines can be diagnosed"><Toggle on={p.capture} onChange={(v) => set({ capture: v })} /></Row>
          <Row label="Label this device" hint="Shows up in Admin → Performance">
            <input value={p.label} onChange={(e) => set({ label: e.target.value.slice(0, 60) })} placeholder="e.g. Mike's laptop" className="w-36 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs outline-none focus:border-amber-300/50" />
          </Row>
          <div className="mt-1 rounded-xl border border-white/10 bg-white/5 p-2">
            <div className="flex items-baseline justify-between text-[11px] text-slate-400"><span>This visit</span><span className="mono">{secs}s captured · {perf.fps} fps now · session {perf.sessionId || "…"}</span></div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button onClick={exportJson} disabled={secs === 0} className="btn-primary !px-3 !py-1.5 !text-xs disabled:opacity-40">Export JSON</button>
              <button onClick={exportCsv} disabled={secs === 0} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs hover:bg-white/10 disabled:opacity-40">CSV</button>
              <button onClick={copyReport} disabled={secs === 0} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs hover:bg-white/10 disabled:opacity-40">{copied ? "Copied ✓" : "Copy report"}</button>
            </div>
            <div className="mt-1.5 text-[11px] text-slate-400">The JSON has your GPU, every second of frame times, draw calls and quality tier. Paste the report or send the file when the hall feels slow.</div>
          </div>
          <details className="mt-2 rounded-xl border border-amber-300/20 bg-amber-300/5 p-2 text-[11px] text-slate-300">
            <summary className="cursor-pointer font-semibold text-amber-200">Slow on a gaming laptop? Check which graphics chip the browser uses</summary>
            <p className="mt-1.5 text-slate-400">Laptops with two chips often run the browser on the small integrated one (Intel UHD / Iris, AMD Radeon Graphics) and leave the big card idle. The overlay above names the chip in use.</p>
            <ol className="mt-1.5 list-decimal space-y-1 pl-4 text-slate-400">
              <li><b className="text-slate-200">Windows:</b> Settings → System → Display → Graphics → Browse, add your browser (firefox.exe / chrome.exe) → Options → <b className="text-slate-200">High performance</b>.</li>
              <li><b className="text-slate-200">NVIDIA:</b> NVIDIA Control Panel → Manage 3D settings → Program Settings → your browser → preferred graphics processor → <b className="text-slate-200">High-performance NVIDIA processor</b>.</li>
              <li>Close the browser completely and reopen it, then check the overlay again.</li>
            </ol>
          </details>
        </div>
        <div className="flex items-center justify-between py-2">
          <button onClick={() => { resetPrefs(); setToast("Settings reset"); }} className="text-xs text-slate-400 hover:text-white">Reset to defaults</button>
          <a href="/app/dashboard" className="text-xs text-amber-300 hover:underline">Dashboard →</a>
        </div>
      </div>
    </>
  );
}
