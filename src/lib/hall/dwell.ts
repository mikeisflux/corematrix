"use client";
/**
 * Dwell: how long a visitor spends at a booth. Time counts while the walker is within reach of it (the "press E" prompt)
 * or its storefront is open, and is reported when they move on, so an exhibitor sees "people stay 48 s" and not just
 * a visit count. Below three seconds nothing is sent: that is walking past.
 */
import { track, useHall } from "@/lib/hall/store";

export function startDwellTracking(): () => void {
  let at: number | null = null, since = 0;
  const flush = () => {
    if (at != null) { const s = Math.round((performance.now() - since) / 1000); if (s >= 3) track({ kind: "dwell", boothId: at, seconds: Math.min(600, s) }); }
    at = null;
  };
  const current = (s: ReturnType<typeof useHall.getState>) => (s.panel === "booth" && s.selected) || (s.mode === "walk" ? s.near : null);
  const unsub = useHall.subscribe((s) => {
    const next = current(s);
    if (next === at) return;
    flush();
    if (next) { at = next; since = performance.now(); }
  });
  const onHide = () => { if (document.hidden) flush(); else if (at) since = performance.now(); };
  document.addEventListener("visibilitychange", onHide);
  window.addEventListener("pagehide", flush);
  return () => { flush(); unsub(); document.removeEventListener("visibilitychange", onHide); window.removeEventListener("pagehide", flush); };
}
