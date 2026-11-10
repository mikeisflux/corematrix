"use client";
/**
 * The chat rooms the always-open chat box reads: "lobby" (the whole hall) and "friends" (only your friends see
 * what you post there, and you see theirs). One list per room, filled once from the server and kept live by the
 * hall's own stream, shared by the dock and the chat panel so nobody fetches twice.
 */
import { useSyncExternalStore } from "react";
import { api } from "./store";
import { onChat } from "./social";

export interface RoomMsg { id: string; room: string; authorName: string; authorBoothId: number | null; body: string; createdAt: number; authorUid?: string; playerId?: string }
const KEEP = 80;
const rooms = new Map<string, RoomMsg[]>();
const loaded = new Set<string>();
let version = 0;
const listeners = new Set<() => void>();
const bump = () => { version++; for (const l of listeners) l(); };
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
let wired = false;
function wire() {
  if (wired) return; wired = true;
  onChat((m) => { const list = rooms.get(m.room) ?? []; rooms.set(m.room, [...list.filter((x) => x.id !== m.id), m].slice(-KEEP)); bump(); });
}
/** Fetch a room's history once (again after `forgetRoom`, e.g. when the person signs in and their friends change). */
export function loadRoom(room: string) {
  wire();
  if (loaded.has(room)) return;
  loaded.add(room);
  api<{ messages: RoomMsg[] }>(`/api/chat?room=${room}`).then((d) => { const live = rooms.get(room) ?? []; rooms.set(room, [...d.messages, ...live.filter((y) => !d.messages.some((z) => z.id === y.id))].slice(-KEEP)); bump(); }).catch(() => { loaded.delete(room); });
}
export function forgetRoom(room: string) { loaded.delete(room); rooms.delete(room); bump(); }
const EMPTY: RoomMsg[] = [];
export function useRoom(room: string): RoomMsg[] {
  useSyncExternalStore(subscribe, () => version, () => 0);
  return rooms.get(room) ?? EMPTY;
}
export function roomMessages(room: string): RoomMsg[] { return rooms.get(room) ?? EMPTY; }
