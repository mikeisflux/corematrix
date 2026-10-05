/**
 * Banner artwork. Owners upload PNG/JPG/WebP (PDFs are rendered to PNG in the
 * browser first). Each upload is normalised with sharp to the slot's target
 * size and stored as base64 in `booth_art`, so a booth can carry full-size
 * art without bloating the floor reads.
 */
import { and, eq } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/lib/db";
import { now } from "@/lib/util";
import { ART_SLOTS, ART_MAX_UPLOAD, ART_FORMATS, type ArtSlot } from "@/lib/config";

export { ART_SLOTS, ART_MAX_UPLOAD, ART_FORMATS, type ArtSlot };
export const isArtSlot = (s: unknown): s is ArtSlot => s === "portrait" || s === "wide";

/** Resize/crop to the slot's exact size and encode as JPEG (PNG when it has transparency). */
export async function normalizeArt(buf: Buffer, slot: ArtSlot): Promise<{ mime: string; data: string; width: number; height: number }> {
  const sharp = (await import("sharp")).default;
  const { width, height } = ART_SLOTS[slot];
  const img = sharp(buf, { failOn: "none", limitInputPixels: 80_000_000 }).rotate();
  const meta = await img.metadata();
  const alpha = !!meta.hasAlpha;
  const out = img.resize(width, height, { fit: "cover", position: "attention" });
  const encoded = alpha ? await out.png({ compressionLevel: 9, palette: false }).toBuffer() : await out.jpeg({ quality: 86, mozjpeg: true }).toBuffer();
  return { mime: alpha ? "image/png" : "image/jpeg", data: encoded.toString("base64"), width, height };
}

export async function setArt(boothId: number, slot: ArtSlot, art: { mime: string; data: string; width: number; height: number } | null) {
  await ensureMigrated();
  if (!art) { await db.delete(schema.boothArt).where(and(eq(schema.boothArt.boothId, boothId), eq(schema.boothArt.slot, slot))); return; }
  const t = now();
  await db.insert(schema.boothArt).values({ boothId, slot, ...art, updatedAt: t })
    .onConflictDoUpdate({ target: [schema.boothArt.boothId, schema.boothArt.slot], set: { ...art, updatedAt: t } });
}

export async function getArt(boothId: number, slot: ArtSlot) {
  await ensureMigrated();
  const [row] = await db.select().from(schema.boothArt).where(and(eq(schema.boothArt.boothId, boothId), eq(schema.boothArt.slot, slot))).limit(1);
  return row ?? null;
}

export type ArtFlags = { portrait?: number; wide?: number }; // slot → updatedAt (doubles as a cache key)
/** Which booths have art, without the bytes. */
export async function artFlags(): Promise<Map<number, ArtFlags>> {
  await ensureMigrated();
  const rows = await db.select({ boothId: schema.boothArt.boothId, slot: schema.boothArt.slot, updatedAt: schema.boothArt.updatedAt }).from(schema.boothArt);
  const m = new Map<number, ArtFlags>();
  for (const r of rows) { const f = m.get(r.boothId) ?? {}; if (isArtSlot(r.slot)) f[r.slot] = r.updatedAt; m.set(r.boothId, f); }
  return m;
}
export async function artFlagsFor(boothId: number): Promise<ArtFlags> {
  await ensureMigrated();
  const rows = await db.select({ slot: schema.boothArt.slot, updatedAt: schema.boothArt.updatedAt }).from(schema.boothArt).where(eq(schema.boothArt.boothId, boothId));
  const f: ArtFlags = {}; for (const r of rows) if (isArtSlot(r.slot)) f[r.slot] = r.updatedAt; return f;
}
