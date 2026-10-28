/**
 * The arcade theater: a playlist of videos (files uploaded to the server's data
 * directory, or external URLs) that the big screen plays in order, looping,
 * with everyone seeing the same moment because the clock picks the position.
 */
import fs from "node:fs";
import path from "node:path";
import { asc, eq, sql } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { newId, now } from "@/lib/util";

export type TheaterVideo = typeof schema.theaterVideos.$inferSelect;
export const VIDEO_MAX_BYTES = 4 * 1024 ** 3; // 4 GB per file
export const VIDEO_TYPES: Record<string, string> = { "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov", "video/x-m4v": "m4v" };

function dbDir(): string {
  const url = process.env.DATABASE_URL ?? "file:./data/forevercomiccon.db";
  return url.startsWith("file:") ? path.dirname(path.resolve(url.slice("file:".length))) : path.resolve("./data");
}
/** Where uploads live: THEATER_DIR, else a `videos` folder beside the database (outside the app tree, so deploys keep it). */
export function videoDir(): string {
  const dir = process.env.THEATER_DIR ? path.resolve(process.env.THEATER_DIR) : path.join(dbDir(), "videos");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}
export function videoPath(row: Pick<TheaterVideo, "src">): string { return path.join(videoDir(), path.basename(row.src)); }

export async function listVideos(): Promise<TheaterVideo[]> {
  await ensureMigrated();
  return db.select().from(schema.theaterVideos).orderBy(asc(schema.theaterVideos.position), asc(schema.theaterVideos.createdAt));
}
export async function getVideo(id: string): Promise<TheaterVideo | null> {
  await ensureMigrated();
  const [r] = await db.select().from(schema.theaterVideos).where(eq(schema.theaterVideos.id, id)).limit(1);
  return r ?? null;
}
export async function addVideo(input: { title: string; kind: "file" | "url"; src: string; mime?: string | null; bytes?: number; duration?: number; id?: string }): Promise<TheaterVideo> {
  await ensureMigrated();
  const [{ maxPos }] = await db.select({ maxPos: sql<number>`coalesce(max(position), -1)` }).from(schema.theaterVideos);
  const row = { id: input.id ?? newId(), title: input.title.trim().slice(0, 120) || "Untitled", kind: input.kind, src: input.src, mime: input.mime ?? null, bytes: input.bytes ?? 0, duration: Math.max(0, input.duration ?? 0), position: Number(maxPos) + 1, enabled: 1, status: "ready", createdAt: now() };
  await db.insert(schema.theaterVideos).values(row);
  return row;
}
export async function updateVideo(id: string, patch: { title?: string; enabled?: boolean; duration?: number; status?: string; src?: string; mime?: string; bytes?: number }): Promise<TheaterVideo | null> {
  await ensureMigrated();
  const set: Partial<TheaterVideo> = {};
  if (typeof patch.status === "string") set.status = patch.status;
  if (typeof patch.src === "string") set.src = patch.src;
  if (typeof patch.mime === "string") set.mime = patch.mime;
  if (typeof patch.bytes === "number") set.bytes = patch.bytes;
  if (typeof patch.title === "string") set.title = patch.title.trim().slice(0, 120) || "Untitled";
  if (typeof patch.enabled === "boolean") set.enabled = patch.enabled ? 1 : 0;
  if (typeof patch.duration === "number" && Number.isFinite(patch.duration)) set.duration = Math.max(0, patch.duration);
  if (Object.keys(set).length) await db.update(schema.theaterVideos).set(set).where(eq(schema.theaterVideos.id, id));
  return getVideo(id);
}
/** Play order = the order of ids given; anything not listed keeps its place after them. */
export async function reorderVideos(ids: string[]): Promise<void> {
  await ensureMigrated();
  for (let i = 0; i < ids.length; i++) await db.update(schema.theaterVideos).set({ position: i }).where(eq(schema.theaterVideos.id, ids[i]));
}
export async function deleteVideo(id: string): Promise<TheaterVideo | null> {
  const row = await getVideo(id);
  if (!row) return null;
  await db.delete(schema.theaterVideos).where(eq(schema.theaterVideos.id, id));
  if (row.kind === "file") { try { fs.unlinkSync(videoPath(row)); } catch { /* already gone */ } }
  return row;
}
/** What the hall plays: enabled items in order, with the caption and the server clock the clients sync to. */
export async function playlist() {
  const [rows, title] = await Promise.all([listVideos(), getSetting("THEATER_TITLE")]);
  return {
    title: (title || "Now showing").slice(0, 60),
    serverTime: Date.now(),
    items: rows.filter((r) => r.enabled && r.status === "ready").map((r) => ({ id: r.id, title: r.title, url: r.kind === "file" ? `/api/theater/file/${r.id}` : r.src, duration: r.duration })),
  };
}
export { scheduleAt } from "@/lib/theater-schedule";
