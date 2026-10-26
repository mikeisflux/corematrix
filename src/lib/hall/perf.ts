"use client";
/**
 * Live performance state for the hall, written every frame by PerfCapture
 * (inside the canvas) and read by the HUD overlay. No React state: the
 * overlay polls it a few times a second.
 */
export interface PerfBucket { t: number; f: number; avg: number; p95: number; max: number; calls: number; tris: number; mode: "w" | "m"; q: "h" | "m" | "l"; npc: number; dpr: number; long: number }
export interface PerfDevice { gpu: string; vendor: string; ua: string; cores: number; memory: number | null; screen: string; viewport: string; dpr: number; touch: boolean }
export const perf = {
  sessionId: "",
  fps: 0, ms: 0, p95: 0, calls: 0, tris: 0, npcs: 0,
  frames: 0, longFrames: 0, startedAt: 0,
  device: null as PerfDevice | null,
  /** every bucket of this visit (capped), so the player can export it without the server */
  history: [] as PerfBucket[],
};
export const PERF_HISTORY_MAX = 1800;

/** Everything about this visit as one JSON document (what the gear menu exports). */
export function perfSnapshot() {
  const h = perf.history;
  const frames = h.reduce((a, b) => a + b.f, 0);
  const secs = h.length ? Math.max(h.length, h[h.length - 1].t - h[0].t + 1) : 0;
  const p95s = h.map((b) => b.p95).sort((a, b) => a - b);
  return {
    kind: "forevercomiccon-perf", version: 1,
    sessionId: perf.sessionId, startedAt: new Date(perf.startedAt).toISOString(), exportedAt: new Date().toISOString(),
    url: typeof location !== "undefined" ? location.href : "",
    device: perf.device,
    summary: h.length === 0 ? null : {
      durationS: secs, frames,
      avgFps: Math.round((frames / secs) * 10) / 10, minFps: Math.min(...h.map((b) => b.f)),
      p95ms: Math.round((p95s[Math.floor(p95s.length * 0.95)] ?? 0) * 10) / 10, worstMs: Math.max(...h.map((b) => b.max)),
      longFrames: h.reduce((a, b) => a + b.long, 0),
      avgCalls: Math.round(h.reduce((a, b) => a + b.calls, 0) / h.length), maxCalls: Math.max(...h.map((b) => b.calls)),
      avgTris: Math.round(h.reduce((a, b) => a + b.tris, 0) / h.length),
    },
    columns: { t: "seconds since start", f: "frames in that second (fps)", avg: "mean frame ms", p95: "95th percentile frame ms", max: "slowest frame ms", calls: "draw calls", tris: "triangles", mode: "w walk / m map", q: "quality h/m/l", npc: "crowd size", dpr: "render pixel ratio", long: "frames over 50 ms" },
    samples: h,
  };
}

/** Compact text version of the snapshot for pasting into a chat. */
export function perfText(): string {
  const s = perfSnapshot(); const d = s.device; const m = s.summary;
  const lines = [`ForeverComicCon performance ${s.sessionId} · ${s.url}`];
  if (d) { lines.push(`GPU: ${d.gpu} (${d.vendor}) · cores ${d.cores} · memory ${d.memory ?? "?"} GB · screen ${d.screen} · viewport ${d.viewport} · dpr ${d.dpr} · touch ${d.touch}`, `UA: ${d.ua}`); }
  if (m) lines.push(`${m.durationS}s · fps avg ${m.avgFps} min ${m.minFps} · frame p95 ${m.p95ms} ms worst ${m.worstMs} ms · long frames ${m.longFrames}/${m.frames} · draw calls avg ${m.avgCalls} max ${m.maxCalls} · tris avg ${m.avgTris}`);
  lines.push("t: fps / p95ms / calls / q / mode / npcs");
  const step = Math.max(1, Math.ceil(s.samples.length / 60));
  for (let i = 0; i < s.samples.length; i += step) { const b = s.samples[i]; lines.push(`${b.t}: ${b.f} / ${b.p95} / ${b.calls} / ${b.q} / ${b.mode} / ${b.npc}`); }
  return lines.join("\n");
}
export function downloadText(name: string, text: string, type = "application/json") {
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
