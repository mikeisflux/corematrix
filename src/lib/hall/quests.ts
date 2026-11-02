"use client";
/**
 * The player's daily quest board on the client: fetched when the hall opens and after anything that can move it
 * (a booth opened, time at the theater), with a toast the moment a quest completes. Theater time is reported from
 * here while the walker is near the screen and a film is playing.
 */
import { useSyncExternalStore } from "react";
import { api, useHall } from "@/lib/hall/store";
import { theater } from "@/lib/hall/theater";

export interface QuestBoard {
  day: string;
  quests: Array<{ id: "visit" | "theater" | "arcade"; title: string; detail: string; icon: string; goal: number; progress: number; coins: number; done: boolean; claimed: boolean }>;
  bonus: { coins: number; claimed: boolean; ready: boolean };
  claimable: number;
}

export const quests: { board: QuestBoard | null; version: number } = { board: null, version: 0 };
const listeners = new Set<() => void>();
function bump() { quests.version++; for (const l of listeners) l(); }
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export function useQuests() { useSyncExternalStore(subscribe, () => quests.version, () => 0); return quests.board; }

/** Replaces the board and toasts for each quest that just finished (not claimed yet) so the player knows to collect. */
export function setBoard(next: QuestBoard | null) {
  const prev = quests.board;
  quests.board = next;
  bump();
  if (!next || !prev) return;
  const finished = next.quests.filter((q) => q.done && !q.claimed && !prev.quests.find((p) => p.id === q.id)?.done);
  if (finished.length) useHall.getState().setToast(`${finished[0].icon} Quest complete: ${finished[0].title} · +${finished[0].coins} coins`, () => useHall.getState().setPanel("quests"));
}

let refreshing: Promise<void> | null = null;
export function refreshQuests(): Promise<void> {
  if (!useHall.getState().me) { setBoard(null); return Promise.resolve(); }
  refreshing ??= api<{ board: QuestBoard | null }>("/api/quests").then((r) => setBoard(r.board)).catch(() => {}).finally(() => { refreshing = null; });
  return refreshing;
}

export async function claimQuest(quest: "visit" | "theater" | "arcade" | "bonus"): Promise<number> {
  const r = await api<{ awarded: number; coins: number; board: QuestBoard }>("/api/quests/claim", { method: "POST", body: JSON.stringify({ quest }) });
  const st = useHall.getState();
  if (st.me) st.setMe({ ...st.me, coins: r.coins }, st.myBooths);
  setBoard(r.board);
  return r.awarded;
}

/** Call once from the hall: reports theater time every 30 s while it counts, and refreshes after booth views. */
export function startQuestTracking(): () => void {
  let watched = 0, last = performance.now();
  const tick = setInterval(() => {
    const t = performance.now(), dt = (t - last) / 1000; last = t;
    const board = quests.board;
    if (!board || !useHall.getState().me) return;
    const q = board.quests.find((x) => x.id === "theater");
    if (!q || q.done || !theater.near || !theater.playing || document.hidden) return;
    watched += dt;
    if (watched < 30) return;
    const seconds = Math.floor(watched); watched = 0;
    void api<{ board: QuestBoard }>("/api/quests/progress", { method: "POST", body: JSON.stringify({ quest: "theater", seconds }) }).then((r) => setBoard(r.board)).catch(() => {});
  }, 1000);
  // a booth view is counted server-side when the booth panel opens; the board catches up a moment later
  let timer: ReturnType<typeof setTimeout> | null = null;
  const unsub = useHall.subscribe((s, prev) => {
    if (s.selected !== prev.selected && s.selected) { if (timer) clearTimeout(timer); timer = setTimeout(() => { void refreshQuests(); }, 2500); }
    if (s.me !== prev.me) void refreshQuests();
  });
  void refreshQuests();
  return () => { clearInterval(tick); unsub(); if (timer) clearTimeout(timer); };
}
