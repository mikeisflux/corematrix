/**
 * Cosplay presets. Original archetypes only (no trademarked characters): each
 * is a set of costume parts built into the avatar model (node names cos_*)
 * plus a colour scheme. Shared by the builder, the runtime, the crowd, the
 * avatar panel and the API validators. No three.js here so it is client- and
 * server-safe.
 */
export const COSTUME_PARTS = ["cos_cape", "cos_mask", "cos_cowl", "cos_cowl_eyes", "cos_helmet", "cos_hat", "cos_antenna", "cos_chest", "cos_belt", "cos_emblem_star", "cos_emblem_bolt", "cos_emblem_ring", "cos_pads", "cos_hood", "cos_robe", "cos_scarf", "cos_pack", "cos_saber", "cos_wand", "cos_blaster"] as const;
export type CostumePart = (typeof COSTUME_PARTS)[number];

export interface Costume {
  name: string;
  blurb: string;
  parts: readonly CostumePart[];
  hideHair?: boolean;
  /** material colours: costume (armour/cowl/hat/hood), costume2 (trim/mask/belt/scarf), cape (also the robe); shirt/pants override
   *  the outfit; prop is the metal or wood of a carried thing, glow its light (a blade, a blaster tip) */
  colors: { costume: string; costume2: string; cape: string; shirt: string; pants: string; prop?: string; glow?: string };
}

export type CostumeId = "none" | "caped" | "vigilante" | "ranger" | "sorcerer" | "android" | "speedster" | "hunter" | "royal" | "starfall" | "nightfox" | "techknight" | "jester" | "deepsea" | "phoenix" | "lightknight" | "darklord" | "ghostcatcher" | "wizardstudent";
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
  // shop costumes (lib/hall/items.ts): bought with coins or claimed free at a sponsoring booth
  starfall: { name: "Starfall", blurb: "Violet cape, gold star, built for a night sky.", parts: ["cos_cape", "cos_emblem_star", "cos_belt", "cos_pads"], colors: { costume: "#5b21b6", costume2: "#fbbf24", cape: "#4c1d95", shirt: "#312e81", pants: "#1e1b4b" } },
  nightfox: { name: "Night fox", blurb: "Eared cowl and a short cape in ember orange.", parts: ["cos_cowl", "cos_cowl_eyes", "cos_cape", "cos_belt"], hideHair: true, colors: { costume: "#c2410c", costume2: "#111827", cape: "#9a3412", shirt: "#1c1917", pants: "#0c0a09" } },
  techknight: { name: "Tech knight", blurb: "Full helmet, plated chest, neon trim.", parts: ["cos_helmet", "cos_chest", "cos_pads", "cos_belt", "cos_emblem_bolt"], hideHair: true, colors: { costume: "#1f2937", costume2: "#4ade80", cape: "#1f2937", shirt: "#0f172a", pants: "#111827" } },
  jester: { name: "Jester", blurb: "Pointed hat, ringed belt, loud colours.", parts: ["cos_hat", "cos_belt", "cos_emblem_ring"], colors: { costume: "#db2777", costume2: "#facc15", cape: "#db2777", shirt: "#7c3aed", pants: "#facc15" } },
  deepsea: { name: "Deep sea", blurb: "Diving helmet, shoulder guards, abyss blue.", parts: ["cos_helmet", "cos_pads", "cos_belt"], hideHair: true, colors: { costume: "#0e7490", costume2: "#a5f3fc", cape: "#0e7490", shirt: "#164e63", pants: "#082f49" } },
  // carried props: the right hand holds the thing, so these read from across the aisle
  lightknight: { name: "Hooded knight", blurb: "Hooded desert robe, a sash, and a humming blue blade in hand.", parts: ["cos_hood", "cos_robe", "cos_belt", "cos_saber"], hideHair: true, colors: { costume: "#c9b58c", costume2: "#5b4636", cape: "#b8a27a", shirt: "#e7dcc3", pants: "#5b4636", prop: "#a1a1aa", glow: "#60a5fa" } },
  darklord: { name: "Hooded lord", blurb: "Black hood, black robe, black cape, and a red blade.", parts: ["cos_hood", "cos_robe", "cos_cape", "cos_belt", "cos_saber"], hideHair: true, colors: { costume: "#0f0f10", costume2: "#3f3f46", cape: "#050505", shirt: "#18181b", pants: "#09090b", prop: "#71717a", glow: "#ef4444" } },
  ghostcatcher: { name: "Ghost catcher", blurb: "Tan jumpsuit, proton pack on the back, blaster in hand, red ring patch.", parts: ["cos_pack", "cos_blaster", "cos_belt", "cos_emblem_ring"], colors: { costume: "#b8a27a", costume2: "#dc2626", cape: "#b8a27a", shirt: "#c4b08a", pants: "#b09a72", prop: "#4b5563", glow: "#fb923c" } },
  wizardstudent: { name: "Wizard student", blurb: "School robe, striped house scarf, and a wand at the ready.", parts: ["cos_robe", "cos_cape", "cos_scarf", "cos_wand"], colors: { costume: "#1f2937", costume2: "#b91c1c", cape: "#111827", shirt: "#374151", pants: "#1f2937", prop: "#6b3f1d", glow: "#fde68a" } },
  phoenix: { name: "Phoenix", blurb: "Flame cape, mask and a bolt that reads as fire.", parts: ["cos_cape", "cos_mask", "cos_emblem_bolt", "cos_belt"], colors: { costume: "#dc2626", costume2: "#fb923c", cape: "#ea580c", shirt: "#b91c1c", pants: "#450a0a" } },
};
/** Costumes that are in the shop rather than free for everyone. */
export const PREMIUM_COSTUMES: readonly CostumeId[] = ["starfall", "nightfox", "techknight", "jester", "deepsea", "phoenix", "lightknight", "darklord", "ghostcatcher", "wizardstudent"];
export const COSTUME_IDS = Object.keys(COSTUMES) as CostumeId[];
export const isCostumeId = (v: unknown): v is CostumeId => typeof v === "string" && Object.hasOwn(COSTUMES, v); // not `in`: "constructor" or "__proto__" would pass and crash every viewer
/** Costumes handed to crowd figures (everything but "none"). */
export const CROWD_COSTUMES = COSTUME_IDS.filter((c) => c !== "none" && !PREMIUM_COSTUMES.includes(c));
