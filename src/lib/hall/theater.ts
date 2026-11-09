"use client";
/**
 * The arcade theater screen: what is showing, whether the walker is close enough for sound, the sound toggle, and the
 * full-screen view. `video` is the one <video> element the 3D screen plays; the full-screen overlay shows that same
 * element, so both views are the same frame and nothing streams twice.
 */
import { useSyncExternalStore } from "react";

export const theater = { near: false, sound: false, playing: false, title: "", open: false, video: null as HTMLVideoElement | null, version: 0 };
const listeners = new Set<() => void>();
export function bumpTheater() { theater.version++; for (const l of listeners) l(); }
export function setTheaterSound(on: boolean) { theater.sound = on; bumpTheater(); }
/** Open or close the full-screen theater. Open means sound on and playback regardless of where you stand. */
export function setTheaterOpen(on: boolean) { theater.open = on; if (on) theater.sound = true; else if (!theater.near) theater.sound = false; bumpTheater(); }
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export function useTheater() { useSyncExternalStore(subscribe, () => theater.version, () => 0); return theater; }
