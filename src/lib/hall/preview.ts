"use client";
/**
 * Hold-to-see: resting the mouse on a comic cover or a portfolio print for a moment shows it full size, over the hall.
 * A hover alone does nothing (people drag the mouse to look around), and moving off closes it. The 3D table starts the
 * hold; the HUD draws a small progress pill while it runs, then the picture.
 */
import { useSyncExternalStore } from "react";

export const HOLD_MS = 2000;
export interface PreviewPiece { url: string; caption: string }
export const preview = {
  url: null as string | null, caption: "",
  holding: null as { since: number; until: number } | null, // the hold is running: the HUD shows progress
  version: 0,
};
const listeners = new Set<() => void>();
function bump() { preview.version++; for (const l of listeners) l(); }
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export function usePreview() { useSyncExternalStore(subscribe, () => preview.version, () => 0); return preview; }

let timer: ReturnType<typeof setTimeout> | null = null;
/**
 * The pointer came to rest on a piece: show it after the hold, unless the pointer leaves first. `piece` may be a
 * function, read when the hold fires, so a print that rotated under the pointer opens as what is there now.
 */
export function holdPreview(piece: PreviewPiece | (() => PreviewPiece | null)) {
  cancelPreview();
  const now = Date.now();
  preview.holding = { since: now, until: now + HOLD_MS }; bump();
  timer = setTimeout(() => {
    timer = null; preview.holding = null;
    const p = typeof piece === "function" ? piece() : piece;
    if (p) { preview.url = p.url; preview.caption = p.caption; }
    bump();
  }, HOLD_MS);
}
export function cancelPreview() {
  if (timer) { clearTimeout(timer); timer = null; }
  if (preview.url || preview.holding) { preview.url = null; preview.caption = ""; preview.holding = null; bump(); }
}
