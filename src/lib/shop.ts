/**
 * The avatar shop on the server: what a player owns, buying with coins, and sponsored items (free at a booth for a
 * while, claimed by walking up to it). Ownership is cached a minute per player for the presence filter, which runs
 * several times a second.
 */
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/lib/db";
import { newId, now } from "@/lib/util";
import { spendCoins } from "@/lib/arcade";
import { ITEMS, itemById, type ShopItem } from "@/lib/hall/items";
import { boothSpace } from "@/lib/hall/layout";
import { roster } from "@/lib/presence";
import { notify } from "@/lib/notify";
import { addEvent } from "@/lib/economy";

export async function ownedItems(userId: string): Promise<Set<string>> {
  await ensureMigrated();
  const rows = await db.select({ itemId: schema.userItems.itemId }).from(schema.userItems).where(eq(schema.userItems.userId, userId));
  return new Set(rows.map((r) => r.itemId));
}

const cache = new Map<string, { at: number; owned: Set<string> }>();
/** Owned items with a minute of staleness: enough for the presence filter, refreshed on purchase. */
export async function ownedItemsCached(userId: string | null | undefined): Promise<Set<string>> {
  if (!userId) return new Set();
  const hit = cache.get(userId);
  if (hit && now() - hit.at < 60_000) return hit.owned;
  const owned = await ownedItems(userId);
  cache.set(userId, { at: now(), owned });
  if (cache.size > 5000) cache.clear();
  return owned;
}
const forget = (userId: string) => cache.delete(userId);

export async function grantItem(userId: string, itemId: string, via: string): Promise<boolean> {
  await ensureMigrated();
  const r = await db.insert(schema.userItems).values({ userId, itemId, via, acquiredAt: now() }).onConflictDoNothing().returning({ itemId: schema.userItems.itemId });
  forget(userId);
  return r.length > 0;
}

export async function buyItem(userId: string, itemId: string): Promise<{ item: ShopItem; coins: number }> {
  const item = itemById(itemId);
  if (!item) throw new Error("No such item");
  if ((await ownedItems(userId)).has(itemId)) throw new Error("You already own that");
  const coins = await spendCoins(userId, item.coins, "item", itemId);
  if (coins === null) throw new Error(`You need ${item.coins} coins for ${item.name}. Quests and the arcade pay coins, or grab a pack.`);
  await grantItem(userId, itemId, "coins");
  return { item, coins };
}

export interface Sponsor { id: string; itemId: string; boothId: number; boothName: string | null; endsAt: number; claims: number }
export async function activeSponsors(): Promise<Sponsor[]> {
  await ensureMigrated();
  const t = now();
  const rows = await db.select({ id: schema.sponsoredItems.id, itemId: schema.sponsoredItems.itemId, boothId: schema.sponsoredItems.boothId, endsAt: schema.sponsoredItems.endsAt, claims: schema.sponsoredItems.claims, boothName: schema.booths.name })
    .from(schema.sponsoredItems).leftJoin(schema.booths, eq(schema.booths.id, schema.sponsoredItems.boothId))
    .where(and(lt(schema.sponsoredItems.startsAt, t), gt(schema.sponsoredItems.endsAt, t)));
  return rows.filter((r) => itemById(r.itemId));
}

export const CLAIM_RANGE = 30; // ft from the booth's centre: standing at it, not across the hall

/** Claim a sponsored item: the player must be on the floor at the booth right now (their presence position says so). */
export async function claimSponsor(userId: string, sponsorId: string): Promise<{ item: ShopItem; boothName: string | null; already: boolean }> {
  const s = (await activeSponsors()).find((x) => x.id === sponsorId);
  if (!s) throw new Error("That offer has ended");
  const item = itemById(s.itemId)!;
  const space = boothSpace(s.boothId);
  const mine = roster().filter((p) => p.uid === userId);
  const there = !!space && mine.some((p) => Math.hypot(p.x - space.x, p.z - space.z) <= CLAIM_RANGE);
  if (!there) throw new Error(`Walk up to ${s.boothName ?? "the booth"} to claim it`);
  const fresh = await grantItem(userId, s.itemId, `sponsor:${s.boothId}`);
  if (fresh) {
    await db.update(schema.sponsoredItems).set({ claims: sql`${schema.sponsoredItems.claims} + 1` }).where(eq(schema.sponsoredItems.id, sponsorId));
    await notify(userId, "coins", `${item.name} is yours`, `A gift from ${s.boothName ?? "a booth"}. Put it on from Your avatar.`, s.boothId);
  }
  return { item, boothName: s.boothName, already: !fresh };
}

export async function addSponsor(itemId: string, boothId: number, days: number, createdBy: string | null): Promise<Sponsor> {
  await ensureMigrated();
  const item = itemById(itemId);
  if (!item) throw new Error("No such item");
  if (!boothSpace(boothId)) throw new Error("No such booth");
  const t = now();
  const [row] = await db.insert(schema.sponsoredItems).values({ id: newId(), itemId, boothId, startsAt: t, endsAt: t + Math.max(1, Math.min(90, days)) * 86_400_000, createdBy, createdAt: t }).returning();
  const [b] = await db.select({ name: schema.booths.name }).from(schema.booths).where(eq(schema.booths.id, boothId));
  await addEvent("boost", boothId, `${b?.name ?? `Booth ${boothId}`} is giving away ${item.name}`, `Walk up and claim it, free, for ${days} ${days === 1 ? "day" : "days"}`, null);
  return { id: row.id, itemId, boothId, boothName: b?.name ?? null, endsAt: row.endsAt, claims: 0 };
}

export async function endSponsor(id: string): Promise<void> {
  await ensureMigrated();
  await db.update(schema.sponsoredItems).set({ endsAt: now() }).where(eq(schema.sponsoredItems.id, id));
}

export { ITEMS };
