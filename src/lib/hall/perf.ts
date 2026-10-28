/**
 * Live performance state for the hall, written every frame by PerfCapture
 * (inside the canvas) and read by the HUD overlay. No React state: the
 * overlay polls it a few times a second.
 */
/** One second of frames. cpu = main-thread ms per frame (scripts + draw submission), rend = the part spent inside renderer.render; the rest of the frame is the GPU or vsync. */
export interface PerfBucket { t: number; f: number; avg: number; p95: number; max: number; calls: number; tris: number; mode: "w" | "m"; q: "h" | "m" | "l"; npc: number; dpr: number; long: number; cpu?: number; rend?: number; lost?: number }
export interface PerfDevice { gpu: string; vendor: string; ua: string; cores: number; memory: number | null; screen: string; viewport: string; dpr: number; touch: boolean }
export const perf = {
  sessionId: "",
  fps: 0, ms: 0, p95: 0, calls: 0, tris: 0, npcs: 0, cpu: 0, rend: 0,
  frames: 0, longFrames: 0, startedAt: 0, contextLost: 0, lostSent: 0,
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
      avgCpu: Math.round((h.reduce((a, b) => a + (b.cpu ?? 0), 0) / h.length) * 10) / 10,
      avgRender: Math.round((h.reduce((a, b) => a + (b.rend ?? 0), 0) / h.length) * 10) / 10,
    },
    columns: { t: "seconds since start", f: "frames in that second (fps)", avg: "mean frame ms", p95: "95th percentile frame ms", max: "slowest frame ms", calls: "draw calls", tris: "triangles", mode: "w walk / m map", q: "quality h/m/l", npc: "crowd size", dpr: "render pixel ratio", long: "frames over 50 ms", cpu: "main-thread ms per frame (scripts + draw submission)", rend: "ms per frame inside renderer.render" },
    samples: h,
  };
}

/** Where a slow frame goes: if the main thread fills most of it, the GPU is waiting on scripts and draw submission; otherwise the GPU (or vsync) is the limit. */
export function verdict(avgCpuMs: number, avgFps: number): string {
  if (!avgFps) return "no frames";
  const frameMs = 1000 / avgFps;
  if (avgFps >= 55) return "smooth";
  if (avgCpuMs <= 0) return "no cpu timing";
  const share = avgCpuMs / frameMs;
  if (share > 0.7) return `main-thread bound (${Math.round(share * 100)}% of each frame is scripts + draw submission)`;
  if (share > 0.4) return `mixed: ${Math.round(share * 100)}% main thread, the rest GPU`;
  return `GPU bound (main thread only ${Math.round(share * 100)}% of the frame)`;
}
/** Compact text version of the snapshot for pasting into a chat. */
export function perfText(): string {
  const s = perfSnapshot(); const d = s.device; const m = s.summary;
  const lines = [`ForeverComicCon performance ${s.sessionId} · ${s.url}`];
  if (d) { lines.push(`GPU: ${d.gpu} (${d.vendor}) · cores ${d.cores} · memory ${d.memory ?? "?"} GB · screen ${d.screen} · viewport ${d.viewport} · dpr ${d.dpr} · touch ${d.touch}`, `UA: ${d.ua}`); }
  if (m) lines.push(`${m.durationS}s · fps avg ${m.avgFps} min ${m.minFps} · frame p95 ${m.p95ms} ms worst ${m.worstMs} ms · long frames ${m.longFrames}/${m.frames} · draw calls avg ${m.avgCalls} max ${m.maxCalls} · tris avg ${m.avgTris} · cpu ${m.avgCpu} ms/frame (render ${m.avgRender}) → ${verdict(m.avgCpu, m.avgFps)}`);
  lines.push("t: fps / p95ms / cpu ms / render ms / calls / q / mode / npcs");
  const step = Math.max(1, Math.ceil(s.samples.length / 60));
  for (let i = 0; i < s.samples.length; i += step) { const b = s.samples[i]; lines.push(`${b.t}: ${b.f} / ${b.p95} / ${b.cpu ?? "-"} / ${b.rend ?? "-"} / ${b.calls} / ${b.q} / ${b.mode} / ${b.npc}`); }
  return lines.join("\n");
}
export function downloadText(name: string, text: string, type = "application/json") {
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
