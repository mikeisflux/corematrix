/**
 * The booth shop: a handful of items with a price and a link, bought on the exhibitor's own site. The hall shows
 * them in the storefront and the public page and counts the "Buy" presses as clicks from the source "shop".
 */
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/lib/db";
import { newId, normalizeUrl, now } from "@/lib/util";
import { PRODUCT_LIMIT, productSlotKey } from "@/lib/config";

export interface ProductRow { id: string; title: string; blurb: string | null; priceCents: number; url: string; sort: number; image: number | null; clicks?: number }

async function imageStamps(boothId: number, ids: string[]): Promise<Map<string, number>> {
  if (!ids.length) return new Map();
  const rows = await db.select({ slot: schema.boothArt.slot, at: schema.boothArt.updatedAt }).from(schema.boothArt)
    .where(and(eq(schema.boothArt.boothId, boothId), inArray(schema.boothArt.slot, ids.map(productSlotKey))));
  return new Map(rows.map((r) => [r.slot.slice("product:".length), r.at]));
}

export async function listProducts(boothId: number, owner = false): Promise<ProductRow[]> {
  await ensureMigrated();
  const rows = await db.select().from(schema.boothProducts).where(eq(schema.boothProducts.boothId, boothId)).orderBy(asc(schema.boothProducts.sort), asc(schema.boothProducts.createdAt));
  const img = await imageStamps(boothId, rows.map((r) => r.id));
  return rows.map((r) => ({ id: r.id, title: r.title, blurb: r.blurb, priceCents: r.priceCents, url: r.url, sort: r.sort, image: img.get(r.id) ?? null, ...(owner ? { clicks: r.clicks } : {}) }));
}

/** Booths that have at least one item, for the floor (a "shop" tag on the booth). */
export async function boothsWithProducts(): Promise<Set<number>> {
  await ensureMigrated();
  const rows = await db.select({ boothId: schema.boothProducts.boothId }).from(schema.boothProducts).groupBy(schema.boothProducts.boothId);
  return new Set(rows.map((r) => r.boothId));
}

export async function upsertProduct(boothId: number, d: { id?: string; title: string; blurb?: string | null; priceCents: number; url: string }): Promise<ProductRow> {
  await ensureMigrated();
  const url = normalizeUrl(d.url);
  if (!url) throw new Error("Enter the full link to buy it, starting with https://");
  const title = d.title.trim().slice(0, 80);
  if (!title) throw new Error("Give the item a name");
  const blurb = (d.blurb ?? "").trim().slice(0, 240) || null;
  const priceCents = Math.max(0, Math.min(1_000_000_00, Math.round(d.priceCents)));
  const t = now();
  if (d.id) {
    const [row] = await db.update(schema.boothProducts).set({ title, blurb, priceCents, url, updatedAt: t })
      .where(and(eq(schema.boothProducts.id, d.id), eq(schema.boothProducts.boothId, boothId))).returning();
    if (!row) throw new Error("That item is gone");
    return { ...row, image: (await imageStamps(boothId, [row.id])).get(row.id) ?? null };
  }
  const [c] = await db.select({ n: sql<number>`count(*)` }).from(schema.boothProducts).where(eq(schema.boothProducts.boothId, boothId));
  if (Number(c?.n ?? 0) >= PRODUCT_LIMIT) throw new Error(`A booth lists up to ${PRODUCT_LIMIT} items. Remove one to add another.`);
  const [row] = await db.insert(schema.boothProducts).values({ id: newId(), boothId, title, blurb, priceCents, url, sort: Number(c?.n ?? 0), createdAt: t, updatedAt: t }).returning();
  return { ...row, image: null };
}

export async function deleteProduct(boothId: number, id: string): Promise<void> {
  await ensureMigrated();
  await db.delete(schema.boothProducts).where(and(eq(schema.boothProducts.id, id), eq(schema.boothProducts.boothId, boothId)));
  await db.delete(schema.boothArt).where(and(eq(schema.boothArt.boothId, boothId), eq(schema.boothArt.slot, productSlotKey(id))));
}

export async function countProductClick(boothId: number, id: string): Promise<string | null> {
  await ensureMigrated();
  const [row] = await db.update(schema.boothProducts).set({ clicks: sql`${schema.boothProducts.clicks} + 1` })
    .where(and(eq(schema.boothProducts.id, id), eq(schema.boothProducts.boothId, boothId))).returning({ url: schema.boothProducts.url });
  return row?.url ?? null;
}
