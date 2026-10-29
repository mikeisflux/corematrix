"use client";
/**
 * Player preferences: graphics, controls and the performance capture. Kept in
 * a plain object (read every frame by the player and the scene) and mirrored
 * to localStorage; React code subscribes through `usePrefs`.
 */
import { useSyncExternalStore } from "react";
import type { Quality } from "./store";

export interface Prefs {
  quality: Quality | "auto";   // auto = the frame-rate monitor steps between tiers
  crowd: "full" | "light" | "none";
  sensitivity: number;         // mouse look multiplier, 0.3 .. 3
  invertY: boolean;
  overlay: boolean;            // live fps readout
  capture: boolean;            // send 1-second stats to the server
  label: string;               // free text tag on captured sessions ("my laptop")
  fpsCap: 30 | 60 | 0;         // frames per second the hall renders at; 0 = as fast as the screen allows
  firstPerson: boolean;        // walk camera at eye level instead of behind the figure (V or the HUD button)
}
export function toggleFirstPerson() { setPrefs({ firstPerson: !getPrefs().firstPerson }); }
export const DEFAULT_PREFS: Prefs = { quality: "auto", crowd: "full", sensitivity: 1, invertY: false, overlay: false, capture: true, label: "", fpsCap: 60, firstPerson: false };
const KEY = "fcc_prefs";

function load(): Prefs {
  if (typeof localStorage === "undefined") return DEFAULT_PREFS;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "{}") as Partial<Prefs>;
    const p: Prefs = { ...DEFAULT_PREFS, ...raw };
    if (!["auto", "high", "medium", "low"].includes(p.quality)) p.quality = "auto";
    if (!["full", "light", "none"].includes(p.crowd)) p.crowd = "full";
    p.sensitivity = Math.min(3, Math.max(0.3, Number(p.sensitivity) || 1));
    p.label = String(p.label ?? "").slice(0, 60);
    if (![0, 30, 60].includes(p.fpsCap)) p.fpsCap = 60;
    p.firstPerson = p.firstPerson === true;
    // ?safe=1: the gentlest settings, for machines whose driver falls over under load
    if (typeof location !== "undefined" && new URLSearchParams(location.search).get("safe") === "1") { p.quality = "low"; p.crowd = "light"; p.fpsCap = 30; }
    // the old overlay flag still counts
    if (localStorage.getItem("fcc_perf") === "1") p.overlay = true;
    return p;
  } catch { return DEFAULT_PREFS; }
}

let current: Prefs = DEFAULT_PREFS;
let loaded = false;
const listeners = new Set<() => void>();
export function getPrefs(): Prefs { if (!loaded && typeof window !== "undefined") { current = load(); loaded = true; } return current; }
export function setPrefs(patch: Partial<Prefs>) {
  current = { ...getPrefs(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(current)); localStorage.setItem("fcc_perf", current.overlay ? "1" : "0"); } catch {}
  for (const l of listeners) l();
}
export function resetPrefs() { current = DEFAULT_PREFS; try { localStorage.removeItem(KEY); localStorage.removeItem("fcc_perf"); } catch {} for (const l of listeners) l(); }
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export function usePrefs(): Prefs { return useSyncExternalStore(subscribe, getPrefs, () => DEFAULT_PREFS); }
