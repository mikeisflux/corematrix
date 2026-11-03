"use client";
/**
 * Hold-to-see: resting the mouse on a comic cover or a portfolio print on a table for a couple of seconds shows it
 * full size, over the hall. A hover alone does nothing (people drag the mouse to look around), and moving off
 * closes it. The 3D table starts the hold; the HUD draws the picture.
 */
import { useSyncExternalStore } from "react";

export const HOLD_MS = 2500;
export const preview = { url: null as string | null, caption: "", version: 0 };
const listeners = new Set<() => void>();
function bump() { preview.version++; for (const l of listeners) l(); }
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export function usePreview() { useSyncExternalStore(subscribe, () => preview.version, () => 0); return preview; }

let timer: ReturnType<typeof setTimeout> | null = null;
/** The pointer came to rest on a piece: show it after the hold, unless the pointer leaves first. */
export function holdPreview(url: string, caption: string) {
  cancelPreview();
  timer = setTimeout(() => { timer = null; preview.url = url; preview.caption = caption; bump(); }, HOLD_MS);
}
export function cancelPreview() {
  if (timer) { clearTimeout(timer); timer = null; }
  if (preview.url) { preview.url = null; preview.caption = ""; bump(); }
}
