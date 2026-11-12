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
import { artKey, isRef, r2Delete, r2Get, r2Put, r2Readable, r2Ready, refKey } from "@/lib/r2";

export { ART_SLOTS, ART_MAX_UPLOAD, ART_FORMATS, type ArtSlot };
void ART_SLOTS;
export const isArtSlot = (s: unknown): s is string => typeof s === "string" && (s === "portrait" || s === "wide" || s === "drape" || s === "tower" || s === "floor" || /^rollup:[0-3]$/.test(s) || /^book:(\d|1[0-5])$/.test(s) || /^product:[a-z0-9]{1,24}$/.test(s) || /^gallery:(\d|[1-3]\d|4[0-7])$/.test(s));

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

/** Save a slot. With R2 switched on the bytes go to the bucket under a versioned key and the row keeps only the reference; the previous object is removed. */
export async function setArt(boothId: number, slot: string, art: { mime: string; data: string; width: number; height: number } | null, adult = false) {
  await ensureMigrated();
  const [prev] = await db.select({ url: schema.boothArt.url }).from(schema.boothArt).where(and(eq(schema.boothArt.boothId, boothId), eq(schema.boothArt.slot, slot))).limit(1);
  const cfg = await r2Ready();
  if (!art) {
    await db.delete(schema.boothArt).where(and(eq(schema.boothArt.boothId, boothId), eq(schema.boothArt.slot, slot)));
    if (cfg && isRef(prev?.url)) await r2Delete(cfg, refKey(prev.url));
    return;
  }
  const t = now();
  let row: { mime: string; data: string; width: number; height: number; url: string | null } = { ...art, url: null };
  if (cfg) row = { ...row, data: "", url: await r2Put(cfg, artKey(boothId, slot, art.mime, t), Buffer.from(art.data, "base64"), art.mime) };
  await db.insert(schema.boothArt).values({ boothId, slot, ...row, adult, updatedAt: t })
    .onConflictDoUpdate({ target: [schema.boothArt.boothId, schema.boothArt.slot], set: { ...row, adult, updatedAt: t } });
  if (cfg && isRef(prev?.url) && prev.url !== row.url) await r2Delete(cfg, refKey(prev.url));
}

export async function getArt(boothId: number, slot: string) {
  await ensureMigrated();
  const [row] = await db.select().from(schema.boothArt).where(and(eq(schema.boothArt.boothId, boothId), eq(schema.boothArt.slot, slot))).limit(1);
  return row ?? null;
}
/** The bytes of a stored slot, wherever they live (the database row, or the bucket). */
export async function artBytes(row: { data: string; url: string | null; mime: string }): Promise<Buffer | null> {
  if (isRef(row.url)) { const cfg = await r2Readable(); const obj = cfg ? await r2Get(cfg, refKey(row.url)).catch(() => null) : null; return obj ? Buffer.from(obj.body) : null; }
  return row.data ? Buffer.from(row.data, "base64") : null;
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

/** Slots marked 18+ (served blurred until the viewer confirms their age), for one booth or for everyone. */
export async function artAdultFor(boothId: number): Promise<string[]> {
  await ensureMigrated();
  const rows = await db.select({ slot: schema.boothArt.slot }).from(schema.boothArt).where(and(eq(schema.boothArt.boothId, boothId), eq(schema.boothArt.adult, true)));
  return rows.map((r) => r.slot);
}
export async function artAdult(): Promise<Map<number, string[]>> {
  await ensureMigrated();
  const rows = await db.select({ boothId: schema.boothArt.boothId, slot: schema.boothArt.slot }).from(schema.boothArt).where(eq(schema.boothArt.adult, true));
  const m = new Map<number, string[]>();
  for (const r of rows) m.set(r.boothId, [...(m.get(r.boothId) ?? []), r.slot]);
  return m;
}
