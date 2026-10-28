"use client";
/**
 * Frame-rate capture. Runs inside the canvas, measures every frame, folds the
 * numbers into 1-second buckets and posts them to /api/perf every 10 s (and on
 * page hide). Also feeds the live overlay. Costs one useFrame callback.
 */
import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { useHall } from "@/lib/hall/store";
import { perf, PERF_HISTORY_MAX, type PerfBucket, type PerfDevice } from "@/lib/hall/perf";
import { getPrefs } from "@/lib/hall/prefs";

let hinted = false;

const FLUSH_EVERY = 10; // seconds
const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

function deviceInfo(gl: WebGLRenderingContext | WebGL2RenderingContext): PerfDevice {
  let gpu = "unknown", vendor = "unknown";
  try {
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    if (ext) { gpu = String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)); vendor = String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL)); }
    else { gpu = String(gl.getParameter(gl.RENDERER)); vendor = String(gl.getParameter(gl.VENDOR)); }
  } catch {}
  const nav = navigator as Navigator & { deviceMemory?: number };
  return {
    gpu, vendor, ua: navigator.userAgent, cores: navigator.hardwareConcurrency || 0, memory: nav.deviceMemory ?? null,
    screen: `${screen.width}x${screen.height}`, viewport: `${window.innerWidth}x${window.innerHeight}`, dpr: window.devicePixelRatio || 1,
    touch: "ontouchstart" in window || navigator.maxTouchPoints > 0,
  };
}

export function PerfCapture() {
  const { gl, viewport } = useThree();
  const frames = useRef<number[]>([]);
  const bucketStart = useRef(0);
  const pending = useRef<PerfBucket[]>([]);
  const calls = useRef<number[]>([]);
  const tris = useRef<number[]>([]);
  const longInBucket = useRef(0);
  const elapsed = useRef(0);
  const cpu = useRef({ sum: 0, n: 0, rend: 0 });

  useEffect(() => {
    if (!perf.sessionId) { perf.sessionId = newId(); perf.startedAt = Date.now(); }
    try { perf.device = deviceInfo(gl.getContext()); } catch { perf.device = null; }
    const flushNow = (beacon: boolean) => {
      const lost = perf.contextLost - perf.lostSent;   // graphics resets since the last post ride along with the samples
      if ((pending.current.length === 0 && !lost) || !perf.device) return;
      if (!getPrefs().capture) { pending.current = []; perf.lostSent = perf.contextLost; return; }
      const body = JSON.stringify({ id: perf.sessionId, device: perf.device, samples: pending.current, url: location.pathname + location.search, label: getPrefs().label || undefined, lost: lost || undefined });
      pending.current = []; perf.lostSent = perf.contextLost;
      if (beacon && navigator.sendBeacon) { navigator.sendBeacon("/api/perf", new Blob([body], { type: "application/json" })); return; }
      void fetch("/api/perf", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => {});
    };
    const onHide = () => flushNow(true);
    window.addEventListener("pagehide", onHide);
    const onVis = () => { if (document.hidden) { paused.current = true; flushNow(true); } };
    document.addEventListener("visibilitychange", onVis);
    const timer = setInterval(() => flushNow(false), FLUSH_EVERY * 1000);
    // time spent inside renderer.render (draw submission on the main thread; a GPU stall shows up here too)
    const orig = gl.render.bind(gl);
    gl.render = (scene, camera) => { const t = performance.now(); orig(scene, camera); cpu.current.rend += performance.now() - t; };
    gl.info.autoReset = false;
    return () => { window.removeEventListener("pagehide", onHide); document.removeEventListener("visibilitychange", onVis); clearInterval(timer); gl.render = orig; gl.info.autoReset = true; flushNow(true); };
  }, [gl]);

  // runs before every other frame callback; the microtask fires once the whole animation frame (callbacks + render) has returned,
  // so this is the main-thread cost of the frame. Whatever is left of the frame time is the GPU or vsync.
  // Also owns the draw-call counters: three resets them on every render() call, and the post-processing composer renders
  // several passes per frame, so the automatic numbers would only describe the last full-screen pass. Counting is
  // switched to manual and reset here, once per frame, after the previous frame's totals have been read.
  const counts = useRef({ calls: 0, tris: 0 });
  const paused = useRef(false);
  useFrame(() => {
    const t0 = performance.now();
    queueMicrotask(() => { cpu.current.sum += performance.now() - t0; cpu.current.n++; });
    counts.current.calls = gl.info.render.calls; counts.current.tris = gl.info.render.triangles;
    gl.info.reset();
  }, -1e9);

  useFrame((state, dt) => {
    const ms = dt * 1000;
    elapsed.current += dt;
    // the first frame back from a hidden tab (or after the machine slept) is a gap, not a slow frame
    if (paused.current || ms > 5000) { paused.current = false; bucketStart.current = state.clock.elapsedTime; cpu.current = { sum: 0, n: 0, rend: 0 }; return; }
    frames.current.push(ms);
    if (ms > 50) longInBucket.current++;
    calls.current.push(counts.current.calls); tris.current.push(counts.current.tris);
    perf.ms = ms; perf.calls = counts.current.calls; perf.tris = counts.current.tris;
    if (state.clock.elapsedTime - bucketStart.current < 1) return;
    bucketStart.current = state.clock.elapsedTime;
    const f = frames.current;
    if (f.length === 0) return;
    const sorted = [...f].sort((a, b) => a - b);
    const st = useHall.getState();
    const bucket: PerfBucket = {
      t: Math.round(elapsed.current), f: f.length,
      avg: Math.round((f.reduce((a, b) => a + b, 0) / f.length) * 10) / 10,
      p95: Math.round(sorted[Math.floor(sorted.length * 0.95)] * 10) / 10,
      max: Math.round(sorted[sorted.length - 1] * 10) / 10,
      calls: Math.round(calls.current.reduce((a, b) => a + b, 0) / calls.current.length),
      tris: Math.round(tris.current.reduce((a, b) => a + b, 0) / tris.current.length),
      mode: st.mode === "walk" ? "w" : "m", q: st.quality[0] as "h" | "m" | "l", npc: perf.npcs,
      dpr: Math.round(viewport.dpr * 100) / 100, long: longInBucket.current,
      cpu: cpu.current.n ? Math.round((cpu.current.sum / cpu.current.n) * 10) / 10 : 0,
      rend: cpu.current.n ? Math.round((cpu.current.rend / cpu.current.n) * 10) / 10 : 0,
    };
    cpu.current = { sum: 0, n: 0, rend: 0 };
    perf.fps = bucket.f; perf.p95 = bucket.p95; perf.frames += bucket.f; perf.longFrames += bucket.long; perf.cpu = bucket.cpu ?? 0; perf.rend = bucket.rend ?? 0;
    pending.current.push(bucket);
    // after 15 s of walking below 30 fps, point at the usual culprit once: a laptop running the browser on its integrated chip
    if (!hinted && bucket.mode === "w") {
      const recent = perf.history.slice(-10);
      const floor = getPrefs().fpsCap === 30 ? 24 : 30;   // a 30 fps cap sits at 30 on purpose
      if (perf.history.length >= 15 && recent.reduce((a, b) => a + b.f, 0) / recent.length < floor) {
        hinted = true;
        useHall.getState().setToast(`Running at ${bucket.f} fps. If this PC has two graphics chips the browser may be on the weak one: open ⚙ Settings for the fix.`);
      }
    }
    perf.history.push(bucket); if (perf.history.length > PERF_HISTORY_MAX) perf.history.splice(0, perf.history.length - PERF_HISTORY_MAX);
    frames.current = []; calls.current = []; tris.current = []; longInBucket.current = 0;
  });
  return null;
}
