"use client";
/**
 * Guided tours: a short list of stops ConBot leads the walker to, one at a time, with a route line on the floor
 * (TourRoute) and a control bar in the HUD (TourBar). The tours themselves are worked out here from whatever the
 * hall store holds, so nothing is asked of the server. Same shape as quests.ts: a plain object the scene reads
 * every frame, and a useSyncExternalStore hook for the React side.
 */
import { useSyncExternalStore } from "react";
import { useHall, type HallBooth } from "@/lib/hall/store";
import { ARCADE, boothSpace, standPoint } from "@/lib/hall/layout";
import { CATEGORIES } from "@/lib/config";
import { botCommand } from "@/lib/hall/conbot";

export interface TourStop {
  x: number; z: number;     // where to stand: the aisle in front of the booth, or a spot on the plaza
  label: string;            // "Acme Comics", "The arcade"
  blurb: string;            // what ConBot says on arrival, shown in the bar once the stop is reached
  boothId: number | null;   // null for the arcade and the theater
}
export interface Tour { id: string; title: string; icon: string; blurb: string; stops: TourStop[] }

/** How close the walker has to get to a stop for it to count, in feet. The stand point is in the middle of a 10 ft aisle. */
export const REACH = 12;
export const MAX_STOPS = 6;

export const tours = { tour: null as Tour | null, index: 0, active: false, reached: false, version: 0 };
const listeners = new Set<() => void>();
function bump() { tours.version++; for (const l of listeners) l(); }
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
/** Re-renders when the tour starts, moves on, reaches a stop or ends. */
export function useTours() { useSyncExternalStore(subscribe, () => tours.version, () => 0); return tours; }

const hasPortfolio = (b: HallBooth) => Object.keys(b.art ?? {}).some((k) => k.startsWith("gallery:"));
const byValue = (a: HallBooth, b: HallBooth) => b.valueCents - a.valueCents;
function where(b: HallBooth): string {
  const sp = boothSpace(b.id);
  return sp?.kind === "artist" ? `Artists' Alley, table ${sp.label}` : `booth ${sp?.label ?? b.label}`;
}
function stopFor(b: HallBooth): TourStop {
  const p = standPoint(b.id);
  const name = b.name || `Booth ${b.label}`;
  // the blurb doubles as ConBot's arrival line, so it reads as a sentence
  return { x: p.x, z: p.z, label: name, blurb: `${name}: ${b.tagline || `${CATEGORIES[b.category]?.name ?? "Exhibitor"}, ${where(b)}`}`, boothId: b.id };
}
function stops(list: HallBooth[]): TourStop[] {
  const seen = new Set<number>(); const out: TourStop[] = [];
  for (const b of list) { if (seen.has(b.id) || out.length >= MAX_STOPS) continue; seen.add(b.id); out.push(stopFor(b)); }
  return out;
}

/** The tours on offer right now, from the booths in the store. Tours without a stop are left out. */
export function buildTours(): Tour[] {
  const st = useHall.getState();
  const all = Array.from(st.booths.values());
  const claimed = all.filter((b) => b.claimedAt != null);
  const out: Tour[] = [];
  // the featured strip first (this week's winner and the landmarks), then the most valuable booths fill the rest
  const featured = st.featured.map((f) => st.booths.get(f.id)).filter((b): b is HallBooth => !!b);
  const head = stops([...featured, ...all.slice().sort(byValue)]);
  if (head.length) out.push({ id: "headliners", title: "Headliners", icon: "★", blurb: "This week's winner, the landmarks and the biggest booths on the floor.", stops: head });
  const fresh = stops(claimed.slice().sort((a, b) => (b.claimedAt ?? 0) - (a.claimedAt ?? 0)));
  if (fresh.length) out.push({ id: "new", title: "New this week", icon: "✨", blurb: "The newest exhibitors to set up on the floor.", stops: fresh });
  const artists = claimed.filter((b) => b.kind === "artist");
  const alley = stops([...artists.filter(hasPortfolio).sort(byValue), ...artists.sort(byValue)]);
  if (alley.length) out.push({ id: "artists", title: "Artists' Alley", icon: "🎨", blurb: "Artist tables with a portfolio to flip through, at the east end of the hall.", stops: alley });
  out.push({
    id: "arcade", title: "The arcade & theater", icon: "🕹️", blurb: "The plaza in the middle: real arcade cabinets and a theater that is always showing something.",
    stops: [
      { x: ARCADE.x, z: ARCADE.z - 26, label: "The arcade", blurb: "The arcade: pick a cabinet, set a high score, win coins.", boothId: null },
      { x: ARCADE.x, z: ARCADE.z + 17, label: "The theater", blurb: "The theater: take a bench, press C to sit, and tap the screen for sound.", boothId: null },
    ],
  });
  for (const [key, cat] of Object.entries(CATEGORIES)) {
    const members = claimed.filter((b) => b.category === key);
    if (members.length < 3) continue;
    out.push({ id: `cat:${key}`, title: cat.name, icon: "🏷️", blurb: `${cat.blurb} ${members.length} booths on the floor.`, stops: stops(members.sort(byValue)) });
  }
  return out;
}

export function currentStop(): TourStop | null { return tours.active && tours.tour ? tours.tour.stops[tours.index] ?? null : null; }

function lead(stop: TourStop) {
  botCommand({ kind: "lead", x: stop.x, z: stop.z, text: `This way to ${stop.label}!`, arrive: stop.blurb });
}

/** Starts a tour by id (from the panel or ?tour=): walking mode, panel closed, ConBot on his way to the first stop. */
export function startTour(id: string): boolean {
  const tour = buildTours().find((t) => t.id === id);
  if (!tour) return false;
  const st = useHall.getState();
  if (st.mode !== "walk") st.setMode("walk");
  if (st.panel !== "none") st.setPanel("none");
  tours.tour = tour; tours.index = 0; tours.active = true; tours.reached = false;
  bump();
  lead(tour.stops[0]);
  return true;
}

/** Called every frame by the route with the walker's position: the stop counts once they are close enough. */
export function tickTour(px: number, pz: number) {
  const stop = currentStop();
  if (!stop || tours.reached) return;
  if (Math.hypot(px - stop.x, pz - stop.z) < REACH) { tours.reached = true; bump(); }
}

export function nextStop() {
  if (!tours.tour || !tours.active) return;
  if (tours.index >= tours.tour.stops.length - 1) { endTour(true); return; }
  tours.index++; tours.reached = false;
  bump();
  lead(tours.tour.stops[tours.index]);
}

export function endTour(done = false) {
  if (!tours.active) return;
  tours.active = false; tours.reached = false;
  bump();
  // a wave sends the robot back to his rounds (an emote ends in walk mode unless his panel is open)
  botCommand({ kind: "say", text: done ? "That's the tour! Enjoy the show." : "Tour's over. Ask me for another any time.", clip: "Wave" });
  if (done) useHall.getState().setToast("Tour done");
}
