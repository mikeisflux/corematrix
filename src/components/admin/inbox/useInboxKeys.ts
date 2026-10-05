"use client";
import { useEffect } from "react";
export interface KeyHandlers { j: () => void; k: () => void; enter: () => void; e: () => void; s: () => void; r: () => void; c: () => void; slash: () => void; escape?: () => void }
/* Gmail-style shortcuts. Disabled while typing, while the composer is open (except Escape), and when a modifier is held. */
export function useInboxKeys(h: KeyHandlers, enabled: boolean) {
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const t = ev.target as HTMLElement | null;
      const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if (ev.key === "Escape" && !typing) { h.escape?.(); return; }
      if (!enabled || typing) return;
      const map: Record<string, (() => void) | undefined> = { j: h.j, k: h.k, Enter: h.enter, e: h.e, s: h.s, r: h.r, c: h.c, "/": h.slash, ArrowDown: h.j, ArrowUp: h.k };
      const fn = map[ev.key];
      if (fn) { ev.preventDefault(); fn(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [h, enabled]);
}
