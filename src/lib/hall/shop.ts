"use client";
/** The avatar shop on the client: the catalogue, what the player owns, what booths are giving away, and buying/claiming. */
import { useSyncExternalStore } from "react";
import { api, useHall } from "@/lib/hall/store";
import { ITEMS, reactionsFor, costumeItem, type ShopItem } from "@/lib/hall/items";

export interface Sponsor { id: string; itemId: string; boothId: number; boothName: string | null; endsAt: number; claims: number }
export const shop = { items: ITEMS as readonly ShopItem[], owned: new Set<string>(), sponsors: [] as Sponsor[], loaded: false, version: 0 };
const listeners = new Set<() => void>();
function bump() { shop.version++; for (const l of listeners) l(); }
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export function useShop() { useSyncExternalStore(subscribe, () => shop.version, () => 0); return shop; }

let refreshing: Promise<void> | null = null;
export function refreshShop(): Promise<void> {
  refreshing ??= api<{ owned: string[]; sponsors: Sponsor[] }>("/api/shop").then((r) => { shop.owned = new Set(r.owned); shop.sponsors = r.sponsors; shop.loaded = true; bump(); }).catch(() => {}).finally(() => { refreshing = null; });
  return refreshing;
}
export const ownsCostume = (c: string | undefined) => { const need = costumeItem(c); return !need || shop.owned.has(need); };
export const myReactions = () => reactionsFor(shop.owned);
/** Sponsors at one booth that the player hasn't claimed yet. */
export const sponsorsAt = (boothId: number | null) => (boothId ? shop.sponsors.filter((s) => s.boothId === boothId && !shop.owned.has(s.itemId)) : []);

export async function buyItem(itemId: string): Promise<ShopItem> {
  const r = await api<{ item: ShopItem; coins: number; owned: string[] }>("/api/shop/buy", { method: "POST", body: JSON.stringify({ itemId }) });
  shop.owned = new Set(r.owned); bump();
  const st = useHall.getState(); if (st.me) st.setMe({ ...st.me, coins: r.coins }, st.myBooths);
  return r.item;
}
export async function claimSponsor(sponsorId: string): Promise<{ item: ShopItem; boothName: string | null; already: boolean }> {
  const r = await api<{ item: ShopItem; boothName: string | null; already: boolean; owned: string[] }>("/api/shop/claim", { method: "POST", body: JSON.stringify({ sponsorId }) });
  shop.owned = new Set(r.owned); bump();
  return r;
}
