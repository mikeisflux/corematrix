/**
 * The show floor. One long exhibit hall laid out like San Diego's: aisles
 * numbered 100…3400 run front-to-back, booths line both sides of every aisle
 * (odd numbers west, even east), a wide cross aisle splits the hall in the
 * middle, Halls A–H are slices along the length, Artists' Alley fills the
 * east end with 6×10 tables, and the arcade sits dead center.
 *
 * Everything here is deterministic: the 3D scene, the floor-plan map, the
 * claim picker and the OG images all agree on where a booth is. Units are
 * feet; +x runs east along the hall, +z runs toward the back wall, the hall
 * is centered on the origin.
 */
import { BOOTH_SIZES, type BoothSize, type Zone, ZONES } from "@/lib/config";

export const AISLE_W = 10; // walking corridor
export const PITCH = 30; // one aisle + booths on both sides
export const SLOT = 10; // booth depth along an aisle
export const SLOTS_PER_HALF = 8; // booths per aisle side per half (front and back of the cross aisle)
export const CROSS = 16; // cross aisle width
export const FRONT = 34; // entrance concourse depth
export const BACK = 22; // back-wall concourse
export const EXHIBIT_AISLES = 28; // numbered 100…2800
export const AA_AISLES = 6; // Artists' Alley aisles east of the exhibit floor
export const AA_SLOT = 6; // table width along an aisle
export const AA_PER_HALF = 13;
export const HALLS = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;

const TOTAL_AISLES = EXHIBIT_AISLES + AA_AISLES;
export const HALL_LENGTH = TOTAL_AISLES * PITCH + AISLE_W; // x extent
export const HALF_DEPTH = SLOTS_PER_HALF * SLOT; // booth run per half
export const HALL_DEPTH = FRONT + HALF_DEPTH * 2 + CROSS + BACK; // z extent
export const X0 = -HALL_LENGTH / 2;
export const Z0 = -HALL_DEPTH / 2; // front wall (entrances)
export const Z_FRONT = Z0 + FRONT; // where booths start
export const Z_CROSS0 = Z_FRONT + HALF_DEPTH; // cross aisle start
export const Z_CROSS1 = Z_CROSS0 + CROSS;
export const Z_BACK = Z_CROSS1 + HALF_DEPTH; // where booths end
export const ARCADE = { x: 0, z: (Z_CROSS0 + Z_CROSS1) / 2, w: 78, d: 86 }; // center plaza, booths inside are removed
export const CEILING = 34;

export interface BoothSpace {
  id: number;
  label: string;
  kind: "exhibitor" | "artist";
  size: BoothSize;
  hall: (typeof HALLS)[number];
  aisle: number; // 100-based for exhibitors, 1-based row for artists
  zone: Zone;
  x: number; // center
  z: number;
  w: number; // along x
  d: number; // along z
  facing: 1 | -1 | 0; // which x direction the open side faces (0 = island, all sides)
  rotationY: number;
  priceCents: number;
}

const halfKey = (z: number) => (z < (Z_CROSS0 + Z_CROSS1) / 2 ? "F" : "B");
const inArcade = (x: number, z: number, w: number, d: number) => Math.abs(x - ARCADE.x) < (w + ARCADE.w) / 2 && Math.abs(z - ARCADE.z) < (d + ARCADE.d) / 2;
const hallOf = (x: number) => HALLS[Math.min(HALLS.length - 1, Math.max(0, Math.floor(((x - X0) / HALL_LENGTH) * HALLS.length)))];
const zoneOf = (x: number, z: number, kind: "exhibitor" | "artist"): Zone => {
  if (kind === "artist") return "artist";
  if (Math.abs(x) < ARCADE.w / 2 + PITCH * 2.5) return "headliner";
  if (z < Z_FRONT + SLOT * 2.01) return "front";
  return "standard";
};
const price = (size: BoothSize, zone: Zone) => Math.round((BOOTH_SIZES[size].priceCents * ZONES[zone].mult) / 100) * 100;

function build(): BoothSpace[] {
  const out: BoothSpace[] = [];
  let id = 1;
  const push = (b: Omit<BoothSpace, "id" | "hall" | "zone" | "priceCents">) => {
    if (inArcade(b.x, b.z, b.w, b.d)) return;
    const zone = zoneOf(b.x, b.z, b.kind);
    out.push({ ...b, id: id++, hall: hallOf(b.x), zone, priceCents: price(b.size, zone) });
  };
  // Exhibit aisles: corridor at x=[ax, ax+10]; west booths face east (+1), east booths face west (-1).
  for (let a = 0; a < EXHIBIT_AISLES; a++) {
    const ax = X0 + a * PITCH + SLOT; // corridor start (west booths occupy ax-10..ax)
    const num = (a + 1) * 100;
    // island rows: in headliner aisles, the two slots next to the cross aisle on the east side of
    // this corridor merge with the west side of the next corridor into one 20×20 island.
    const islandAisle = Math.abs(ax + AISLE_W / 2) < ARCADE.w / 2 + PITCH * 2.5 && a % 2 === 0 && a + 1 < EXHIBIT_AISLES;
    for (const half of [0, 1] as const) {
      const zStart = half === 0 ? Z_FRONT : Z_CROSS1;
      for (const side of [-1, 1] as const) {
        // side -1: west booths (x center ax - 5), facing +1 toward corridor; side 1: east booths (ax+15), facing -1.
        const cx = side === -1 ? ax - SLOT / 2 : ax + AISLE_W + SLOT / 2;
        const facing: 1 | -1 = side === -1 ? 1 : -1;
        let s = 0;
        while (s < SLOTS_PER_HALF) {
          const sIdx = half * SLOTS_PER_HALF + s;
          const slotNum = side === -1 ? 2 * sIdx + 1 : 2 * sIdx + 2;
          const label = `${num + slotNum}`;
          const nearCross = half === 0 ? s === SLOTS_PER_HALF - 2 : s === 0;
          const nearFront = half === 0 && s === 0;
          const z = zStart + s * SLOT + SLOT / 2;
          if (islandAisle && side === 1 && (nearCross || nearFront)) {
            // 20×20 island straddling this corridor's east booths and the next corridor's west booths
            push({ label, kind: "exhibitor", size: "20x20", aisle: num, x: cx + SLOT / 2, z: z + SLOT / 2, w: 20, d: 20, facing: 0, rotationY: 0 });
            s += 2; continue;
          }
          if (nearCross && !(islandAisle && side === 1)) {
            // corner booth: 20×10 (two slots along the aisle) at the cross-aisle end
            push({ label, kind: "exhibitor", size: "20x10", aisle: num, x: cx, z: z + SLOT / 2, w: SLOT, d: 20, facing, rotationY: 0 });
            s += 2; continue;
          }
          push({ label, kind: "exhibitor", size: "10x10", aisle: num, x: cx, z, w: SLOT, d: SLOT, facing, rotationY: 0 });
          s += 1;
        }
      }
    }
  }
  // The west side of the aisle after an island aisle has a hole where the island took its two slots; skip those.
  const islands = out.filter((b) => b.size === "20x20");
  const covered = (b: BoothSpace) => islands.some((i) => Math.abs(i.x - b.x) < (i.w + b.w) / 2 - 0.1 && Math.abs(i.z - b.z) < (i.d + b.d) / 2 - 0.1);
  const exhibitors = out.filter((b) => b.size === "20x20" || !covered(b));
  // Artists' Alley: 6 aisles east of the exhibit floor, 6×10 tables both sides, lettered rows.
  const rows: BoothSpace[] = [];
  for (let a = 0; a < AA_AISLES; a++) {
    const ax = X0 + (EXHIBIT_AISLES + a) * PITCH + SLOT;
    const rowLetter = String.fromCharCode(65 + a * 2), rowLetter2 = String.fromCharCode(66 + a * 2);
    for (const half of [0, 1] as const) {
      const zStart = half === 0 ? Z_FRONT : Z_CROSS1;
      for (const side of [-1, 1] as const) {
        const cx = side === -1 ? ax - SLOT / 2 : ax + AISLE_W + SLOT / 2;
        for (let s = 0; s < AA_PER_HALF; s++) {
          const z = zStart + s * AA_SLOT + AA_SLOT / 2 + 1;
          const n = half * AA_PER_HALF + s + 1;
          rows.push({ id: 0, label: `AA-${side === -1 ? rowLetter : rowLetter2}${String(n).padStart(2, "0")}`, kind: "artist", size: "6x10", hall: "H", aisle: a + 1, zone: "artist", x: cx, z, w: SLOT, d: AA_SLOT, facing: side === -1 ? 1 : -1, rotationY: 0, priceCents: price("6x10", "artist") });
        }
      }
    }
  }
  let n = 1;
  return [...exhibitors, ...rows].map((b) => ({ ...b, id: n++ }));
}

let cache: BoothSpace[] | null = null;
export function hallLayout(): BoothSpace[] {
  if (!cache) cache = build();
  return cache;
}
let byId: Map<number, BoothSpace> | null = null;
export function boothSpace(id: number): BoothSpace | undefined {
  if (!byId) byId = new Map(hallLayout().map((b) => [b.id, b]));
  return byId.get(id);
}
export function totalBooths(): number { return hallLayout().length; }
export function boothPosition(id: number): { x: number; z: number; rotationY: number; facing: number } {
  const b = boothSpace(id);
  return b ? { x: b.x, z: b.z, rotationY: b.rotationY, facing: b.facing } : { x: 0, z: 0, rotationY: 0, facing: 1 };
}
/** Where a visitor stands to look at this booth: in the corridor in front of its open side. */
export function standPoint(id: number): { x: number; z: number } {
  const b = boothSpace(id);
  if (!b) return { x: 0, z: Z0 + FRONT / 2 };
  if (b.facing === 0) return { x: b.x, z: b.z + b.d / 2 + CROSS / 2 };
  return { x: b.x + b.facing * (b.w / 2 + AISLE_W / 2), z: b.z };
}
export function describeSpace(b: BoothSpace): string {
  return b.kind === "artist" ? `Artists' Alley · table ${b.label}` : `Hall ${b.hall} · aisle ${b.aisle} · booth ${b.label}`;
}

/** Signage tier from value: what the booth looks like from across the hall. */
export function signageForValue(valueCents: number, tier: string = "free"): { level: 0 | 1 | 2 | 3 | 4; height: number } {
  const v = valueCents / 100;
  const level = v >= 1500 ? 4 : v >= 400 ? 3 : v >= 120 ? 2 : v >= 30 ? 1 : 0;
  const bonus = tier === "landmark" ? 1.4 : tier === "pro" ? 1.15 : 1;
  const base = [8, 10, 13, 17, 22][level];
  return { level, height: Math.min(CEILING - 2, Math.round(base * bonus * 10) / 10) };
}
