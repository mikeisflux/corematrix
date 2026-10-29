/**
 * Banner artwork. Owners upload PNG/JPG/WebP (PDFs are rendered to PNG in the
 * browser first). Each upload is normalised with sharp to the slot's target
 * size and stored as base64 in `booth_art`, so a booth can carry full-size
 * art without bloating the floor reads.
 */
import { and, eq, sql } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/lib/db";
import { now } from "@/lib/util";
import { ART_SLOTS, ART_MAX_UPLOAD, ART_FORMATS, specForSlot, type ArtSlot } from "@/lib/config";

export { ART_SLOTS, ART_MAX_UPLOAD, ART_FORMATS, type ArtSlot };
void ART_SLOTS;
export const isArtSlot = (s: unknown): s is string => typeof s === "string" && (s === "portrait" || s === "wide" || s === "drape" || s === "tower" || s === "floor" || /^rollup:[0-3]$/.test(s) || /^book:(\d|1[0-5])$/.test(s));

/** Resize/crop to the slot's exact size and encode as JPEG (PNG when it has transparency). */
export async function normalizeArt(buf: Buffer, slot: string): Promise<{ mime: string; data: string; width: number; height: number }> {
  const sharp = (await import("sharp")).default;
  const { width, height } = specForSlot(slot);
  const img = sharp(buf, { failOn: "none", limitInputPixels: 80_000_000 }).rotate();
  const meta = await img.metadata();
  if (slot === "drape") {
    // centred, never cropped, transparent around it so the table cloth shows through
    const png = await img.resize(width, height, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png({ compressionLevel: 9 }).toBuffer();
    return { mime: "image/png", data: png.toString("base64"), width, height };
  }
  const alpha = !!meta.hasAlpha;
  const out = img.resize(width, height, { fit: "cover", position: "attention" });
  const encoded = alpha ? await out.png({ compressionLevel: 9, palette: false }).toBuffer() : await out.jpeg({ quality: 86, mozjpeg: true }).toBuffer();
  return { mime: alpha ? "image/png" : "image/jpeg", data: encoded.toString("base64"), width, height };
}

export async function setArt(boothId: number, slot: string, art: { mime: string; data: string; width: number; height: number } | null) {
  await ensureMigrated();
  if (!art) { await db.delete(schema.boothArt).where(and(eq(schema.boothArt.boothId, boothId), eq(schema.boothArt.slot, slot))); return; }
  const t = now();
  await db.insert(schema.boothArt).values({ boothId, slot, ...art, updatedAt: t })
    .onConflictDoUpdate({ target: [schema.boothArt.boothId, schema.boothArt.slot], set: { ...art, updatedAt: t } });
}

export async function getArt(boothId: number, slot: string) {
  await ensureMigrated();
  const [row] = await db.select().from(schema.boothArt).where(and(eq(schema.boothArt.boothId, boothId), eq(schema.boothArt.slot, slot))).limit(1);
  return row ?? null;
}

export type ArtFlags = Record<string, number>; // slot key → updatedAt (doubles as a cache key)
/** Which booths have art, without the bytes. */
export async function artFlags(): Promise<Map<number, ArtFlags>> {
  await ensureMigrated();
  const rows = await db.select({ boothId: schema.boothArt.boothId, slot: schema.boothArt.slot, updatedAt: schema.boothArt.updatedAt }).from(schema.boothArt);
  const m = new Map<number, ArtFlags>();
  for (const r of rows) { const f = m.get(r.boothId) ?? {}; f[r.slot] = r.updatedAt; m.set(r.boothId, f); }
  return m;
}
export async function artFlagsFor(boothId: number): Promise<ArtFlags> {
  await ensureMigrated();
  const rows = await db.select({ slot: schema.boothArt.slot, updatedAt: schema.boothArt.updatedAt }).from(schema.boothArt).where(eq(schema.boothArt.boothId, boothId));
  const f: ArtFlags = {}; for (const r of rows) f[r.slot] = r.updatedAt; return f;
}

/** Buy links per cover slot (book:N → https://…), for one booth or for everyone. */
export async function artLinksFor(boothId: number): Promise<Record<string, string>> {
  await ensureMigrated();
  const rows = await db.select({ slot: schema.boothArt.slot, link: schema.boothArt.link }).from(schema.boothArt).where(eq(schema.boothArt.boothId, boothId));
  const out: Record<string, string> = {}; for (const r of rows) if (r.link) out[r.slot] = r.link; return out;
}
export async function artLinks(): Promise<Map<number, Record<string, string>>> {
  await ensureMigrated();
  const rows = await db.select({ boothId: schema.boothArt.boothId, slot: schema.boothArt.slot, link: schema.boothArt.link }).from(schema.boothArt).where(sql`${schema.boothArt.link} IS NOT NULL`);
  const m = new Map<number, Record<string, string>>();
  for (const r of rows) { if (!r.link) continue; const f = m.get(r.boothId) ?? {}; f[r.slot] = r.link; m.set(r.boothId, f); }
  return m;
}
export async function setArtLink(boothId: number, slot: string, link: string | null) {
  await ensureMigrated();
  await db.update(schema.boothArt).set({ link }).where(and(eq(schema.boothArt.boothId, boothId), eq(schema.boothArt.slot, slot)));
}
