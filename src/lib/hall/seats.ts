/**
 * Places to sit: the chair behind each exhibitor's table (owner only) and the
 * theater benches (anyone). Chairs register themselves from the booth they
 * belong to; bench spots are fixed. The player sits with C, the HUD button or
 * a click on the seat, and stands up again by moving.
 */
import { ARCADE } from "./layout";

export interface Seat { id: string; x: number; z: number; yaw: number; booth?: number }

const BENCH_W = 12, BENCH_SPOTS = 5;
/** Same benches as Avatar.tsx / Arcade.tsx: two rows of two, facing the screen (+z). Five spots per bench. */
export const BENCH_SEATS: Seat[] = [21.5, 26].flatMap((dz, r) => [-8, 8].flatMap((dx, c) =>
  Array.from({ length: BENCH_SPOTS }, (_, i) => ({ id: `bench:${r}${c}:${i}`, x: ARCADE.x + dx - BENCH_W / 2 + (i + 0.5) * (BENCH_W / BENCH_SPOTS), z: ARCADE.z + dz, yaw: 0 }))));

const chairs = new Map<string, Seat>();
export function registerSeat(seat: Seat) { chairs.set(seat.id, seat); }
export function unregisterSeat(id: string) { chairs.delete(id); }

/**
 * The closest seat to (x, z) that `allowed` says this person may use. Booth floors are
 * solid, so an exhibitor reaches their chair from the booth's edge: 9 ft for chairs, 6 ft for bench spots.
 */
export function nearestSeat(x: number, z: number, allowed: (s: Seat) => boolean = () => true): Seat | null {
  let best: Seat | null = null, bd = Infinity;
  const consider = (s: Seat) => { const d = Math.hypot(s.x - x, s.z - z); if (d < bd && d < (s.booth != null ? 9 : 6) && allowed(s)) { bd = d; best = s; } };
  for (const s of chairs.values()) consider(s);
  if (Math.abs(x - ARCADE.x) < 20 && Math.abs(z - ARCADE.z) < ARCADE.d / 2) for (const s of BENCH_SEATS) consider(s);
  return best;
}

/** A sit request from the HUD or a click on a seat; the player picks it up on its next frame. */
export const seating: { request: { seat: Seat | "stand"; t: number } | null } = { request: null };
export function requestSit(seat: Seat | "stand") { seating.request = { seat, t: Date.now() }; }
export function seatOf(id: string): Seat | null { return chairs.get(id) ?? BENCH_SEATS.find((s) => s.id === id) ?? null; }
