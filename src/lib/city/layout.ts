/**
 * Deterministic layout of plots along the avenue. Shared by the 3D scene,
 * the minimap and the OG images so every view agrees on where a plot is.
 *
 * The avenue runs along +X. Blocks of PLOTS_PER_BLOCK plots alternate sides:
 * odd plot numbers are on the north side (z < 0), even on the south.
 * Every block is separated by a cross street.
 */
import { PLOTS_PER_BLOCK } from "@/lib/config";

export const LOT_WIDTH = 10;
export const LOT_DEPTH = 10;
export const LOT_GAP = 2;
export const ROAD_HALF = 9; // half-width of the avenue (road + sidewalks)
export const CROSS_STREET = 14;
export const PER_SIDE = PLOTS_PER_BLOCK / 2;
export const BLOCK_LENGTH = PER_SIDE * (LOT_WIDTH + LOT_GAP) + CROSS_STREET;

export interface PlotPosition {
  x: number;
  z: number;
  side: 1 | -1; // -1 north, 1 south
  block: number;
  rotationY: number;
}

export function plotPosition(plotId: number): PlotPosition {
  const idx = plotId - 1;
  const block = Math.floor(idx / PLOTS_PER_BLOCK);
  const inBlock = idx % PLOTS_PER_BLOCK;
  const side: 1 | -1 = inBlock % 2 === 0 ? -1 : 1;
  const slot = Math.floor(inBlock / 2);
  const x = block * BLOCK_LENGTH + slot * (LOT_WIDTH + LOT_GAP) + LOT_WIDTH / 2;
  const z = side * (ROAD_HALF + LOT_DEPTH / 2 + 1);
  return { x, z, side, block, rotationY: side === -1 ? 0 : Math.PI };
}

export function avenueLength(plotCount: number): number {
  const blocks = Math.max(1, Math.ceil(plotCount / PLOTS_PER_BLOCK));
  return blocks * BLOCK_LENGTH;
}

export const FLOOR_HEIGHT = 0.42;

/**
 * Floors from value: $5 per floor up to 120, then a log tail so a
 * $5,000 building is still visibly taller than a $600 one without
 * leaving the atmosphere.
 */
export function floorsForValue(valueCents: number): number {
  const f = Math.max(1, valueCents / 500);
  if (f <= 120) return Math.round(f);
  return Math.round(120 + 25 * Math.log2(f / 120));
}

export function heightForValue(valueCents: number, tier: string = "free"): number {
  const floors = floorsForValue(valueCents);
  const bonus = tier === "landmark" ? 1.25 : tier === "pro" ? 1.1 : 1;
  return Math.round((2.5 + floors * FLOOR_HEIGHT * bonus) * 10) / 10;
}
