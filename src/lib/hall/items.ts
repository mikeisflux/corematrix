/**
 * The avatar shop catalogue. Costumes are presets in lib/hall/costumes.ts; reaction packs add emoji to the reaction
 * row. Bought with coins (which can be earned, or bought in packs), or claimed free at a booth that sponsors the item
 * for a while. No three.js here: shared by the panels, the API validators and the presence filter.
 */
import { COSTUMES, PREMIUM_COSTUMES, type CostumeId } from "@/lib/hall/costumes";

export type ItemKind = "costume" | "reactions";
export interface ShopItem { id: string; kind: ItemKind; name: string; blurb: string; icon: string; coins: number; costume?: CostumeId; reactions?: readonly string[] }

const COSTUME_PRICES: Partial<Record<CostumeId, number>> = { starfall: 120, nightfox: 120, techknight: 150, jester: 90, deepsea: 110, phoenix: 150 };
export const ITEMS: readonly ShopItem[] = [
  ...PREMIUM_COSTUMES.map((c): ShopItem => ({ id: `costume:${c}`, kind: "costume", name: COSTUMES[c].name, blurb: COSTUMES[c].blurb, icon: "🦸", coins: COSTUME_PRICES[c] ?? 100, costume: c })),
  { id: "reactions:party", kind: "reactions", name: "Party pack", blurb: "🥳 🎊 🍕 🎸 for the reaction row.", icon: "🥳", coins: 40, reactions: ["🥳", "🎊", "🍕", "🎸"] },
  { id: "reactions:spooky", kind: "reactions", name: "Spooky pack", blurb: "🎃 👻 💀 🦇 for the reaction row.", icon: "👻", coins: 40, reactions: ["🎃", "👻", "💀", "🦇"] },
  { id: "reactions:hearts", kind: "reactions", name: "Hearts pack", blurb: "💖 💜 💙 💚 for the reaction row.", icon: "💖", coins: 40, reactions: ["💖", "💜", "💙", "💚"] },
  { id: "reactions:comics", kind: "reactions", name: "Comics pack", blurb: "💥 ⚡ 🦹 📚 for the reaction row.", icon: "💥", coins: 40, reactions: ["💥", "⚡", "🦹", "📚"] },
];
export const itemById = (id: string): ShopItem | undefined => ITEMS.find((i) => i.id === id);
export const isItemId = (v: unknown): v is string => typeof v === "string" && ITEMS.some((i) => i.id === v);
/** The reaction emoji everyone has. */
export const BASE_REACTIONS = ["👋", "❤️", "😂", "🔥", "👏", "🎉", "😮", "👍"] as const;
/** Every reaction any pack can add, for the presence validator. */
export const ALL_REACTIONS: readonly string[] = [...BASE_REACTIONS, ...ITEMS.flatMap((i) => i.reactions ?? [])];
/** The costume item id for a costume, or null when the costume is free. */
export const costumeItem = (c: string | undefined): string | null => (c && PREMIUM_COSTUMES.includes(c as CostumeId) ? `costume:${c}` : null);
/** Reactions a player may use given the items they own. */
export function reactionsFor(owned: ReadonlySet<string>): string[] {
  return [...BASE_REACTIONS, ...ITEMS.filter((i) => i.reactions && owned.has(i.id)).flatMap((i) => i.reactions!)];
}
