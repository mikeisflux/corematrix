/**
 * Cosplay presets. Original archetypes only (no trademarked characters): each
 * is a set of costume parts built into the avatar model (node names cos_*)
 * plus a colour scheme. Shared by the builder, the runtime, the crowd, the
 * avatar panel and the API validators. No three.js here so it is client- and
 * server-safe.
 */
export const COSTUME_PARTS = ["cos_cape", "cos_mask", "cos_cowl", "cos_cowl_eyes", "cos_helmet", "cos_hat", "cos_antenna", "cos_chest", "cos_belt", "cos_emblem_star", "cos_emblem_bolt", "cos_emblem_ring", "cos_pads"] as const;
export type CostumePart = (typeof COSTUME_PARTS)[number];

export interface Costume {
  name: string;
  blurb: string;
  parts: readonly CostumePart[];
  hideHair?: boolean;
  /** material colours: costume (armour/cowl/hat), costume2 (trim/mask/belt), cape; shirt/pants override the outfit */
  colors: { costume: string; costume2: string; cape: string; shirt: string; pants: string };
}

export type CostumeId = "none" | "caped" | "vigilante" | "ranger" | "sorcerer" | "android" | "speedster" | "hunter" | "royal";
export const COSTUMES: Record<CostumeId, Costume> = {
  none: { name: "No costume", blurb: "Just you.", parts: [], colors: { costume: "#888888", costume2: "#888888", cape: "#888888", shirt: "", pants: "" } },
  caped: { name: "Caped hero", blurb: "Cape, domino mask, star on the chest.", parts: ["cos_cape", "cos_mask", "cos_emblem_star", "cos_belt"], colors: { costume: "#b91c1c", costume2: "#facc15", cape: "#b91c1c", shirt: "#1d4ed8", pants: "#1d4ed8" } },
  vigilante: { name: "Night vigilante", blurb: "Cowl with ears, long cape, utility belt.", parts: ["cos_cowl", "cos_cowl_eyes", "cos_cape", "cos_belt", "cos_emblem_ring"], hideHair: true, colors: { costume: "#111827", costume2: "#6b7280", cape: "#0b0f1a", shirt: "#1f2937", pants: "#111827" } },
  ranger: { name: "Space ranger", blurb: "Visored helmet, chest plate, shoulder pads.", parts: ["cos_helmet", "cos_chest", "cos_pads", "cos_belt"], hideHair: true, colors: { costume: "#f1f5f9", costume2: "#06b6d4", cape: "#f1f5f9", shirt: "#0ea5e9", pants: "#e2e8f0" } },
  sorcerer: { name: "Sorcerer", blurb: "Pointed hat and a flowing cape.", parts: ["cos_hat", "cos_cape", "cos_belt"], colors: { costume: "#4c1d95", costume2: "#f59e0b", cape: "#6d28d9", shirt: "#4c1d95", pants: "#1e1b4b" } },
  android: { name: "Android", blurb: "Antenna, chrome chest plate, glowing trim.", parts: ["cos_antenna", "cos_chest", "cos_pads", "cos_belt"], colors: { costume: "#9ca3af", costume2: "#22d3ee", cape: "#9ca3af", shirt: "#374151", pants: "#4b5563" } },
  speedster: { name: "Speedster", blurb: "Mask and a lightning bolt.", parts: ["cos_mask", "cos_emblem_bolt", "cos_belt"], colors: { costume: "#facc15", costume2: "#dc2626", cape: "#facc15", shirt: "#dc2626", pants: "#b91c1c" } },
  hunter: { name: "Monster hunter", blurb: "Mask, leather chest rig, short cape.", parts: ["cos_mask", "cos_chest", "cos_belt", "cos_cape"], colors: { costume: "#14532d", costume2: "#84cc16", cape: "#052e16", shirt: "#166534", pants: "#1c1917" } },
  royal: { name: "Warrior royal", blurb: "Crown of antenna spikes, gold armour, crimson cape.", parts: ["cos_chest", "cos_pads", "cos_cape", "cos_belt", "cos_emblem_ring"], colors: { costume: "#d4a017", costume2: "#7f1d1d", cape: "#991b1b", shirt: "#7f1d1d", pants: "#3f0d0d" } },
};
export const COSTUME_IDS = Object.keys(COSTUMES) as CostumeId[];
export const isCostumeId = (v: unknown): v is CostumeId => typeof v === "string" && Object.hasOwn(COSTUMES, v); // not `in`: "constructor" or "__proto__" would pass and crash every viewer
/** Costumes handed to crowd figures (everything but "none"). */
export const CROWD_COSTUMES = COSTUME_IDS.filter((c) => c !== "none");
