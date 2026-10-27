"use client";
/** The arcade theater screen: what is showing, whether the walker is close enough for sound, and the sound toggle. */
import { useSyncExternalStore } from "react";

export const theater = { near: false, sound: false, playing: false, title: "", version: 0 };
const listeners = new Set<() => void>();
export function bumpTheater() { theater.version++; for (const l of listeners) l(); }
export function setTheaterSound(on: boolean) { theater.sound = on; bumpTheater(); }
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export function useTheater() { useSyncExternalStore(subscribe, () => theater.version, () => 0); return theater; }
