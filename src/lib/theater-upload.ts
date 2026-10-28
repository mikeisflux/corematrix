/**
 * Resumable film uploads: the browser sends fixed-size chunks that are written
 * into a .part file at their offset; a small manifest beside it remembers which
 * chunks have landed, so a dropped connection or a reloaded tab picks up where
 * it left off instead of starting a 1.5 GB file over.
 */
import fs from "node:fs";
import path from "node:path";
import { videoDir, VIDEO_MAX_BYTES, VIDEO_TYPES, addVideo } from "@/lib/theater";
import { newId, now } from "@/lib/util";

export const CHUNK_BYTES = 8 * 1024 * 1024;
const STALE_MS = 3 * 86_400_000;

export interface UploadManifest { id: string; name: string; type: string; ext: string; size: number; duration: number; chunks: number; received: number[]; createdAt: number; updatedAt: number }
/** Chunks land in parallel, so each one leaves its own marker file instead of racing to rewrite the manifest. */
const markerPath = (id: string, index: number) => path.join(dir(), `${id}.${index}.ok`);
function receivedChunks(id: string): number[] {
  const prefix = `${id}.`;
  const out: number[] = [];
  for (const f of fs.readdirSync(dir())) { if (f.startsWith(prefix) && f.endsWith(".ok")) { const n = Number(f.slice(prefix.length, -3)); if (Number.isInteger(n)) out.push(n); } }
  return out.sort((a, b) => a - b);
}

function dir(): string { const d = path.join(videoDir(), ".uploads"); fs.mkdirSync(d, { recursive: true }); return d; }
const manifestPath = (id: string) => path.join(dir(), `${id}.json`);
const partPath = (id: string) => path.join(dir(), `${id}.part`);
const safeId = (id: string) => /^[a-z0-9]{6,32}$/.test(id);

export function readManifest(id: string): UploadManifest | null {
  if (!safeId(id)) return null;
  try { const m = JSON.parse(fs.readFileSync(manifestPath(id), "utf8")) as UploadManifest; m.received = receivedChunks(id); return m; } catch { return null; }
}
function writeManifest(m: UploadManifest) {
  const tmp = manifestPath(m.id) + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(m));
  fs.renameSync(tmp, manifestPath(m.id));
}
/** Forget half-finished uploads nobody has touched for days (the .part file's mtime moves with every chunk). */
export function sweepStale() {
  try {
    for (const f of fs.readdirSync(dir())) {
      if (!f.endsWith(".part")) continue;
      const id = f.slice(0, -5);
      try { if (Date.now() - fs.statSync(path.join(dir(), f)).mtimeMs > STALE_MS) abandonUpload(id); } catch { /* raced */ }
    }
  } catch { /* nothing to sweep */ }
}

export function beginUpload(input: { name: string; type: string; size: number; duration: number }): UploadManifest | { error: string } {
  const type = input.type.split(";")[0].trim().toLowerCase();
  const ext = VIDEO_TYPES[type];
  if (!ext) return { error: `Unsupported video type "${type || "unknown"}". Use MP4 (H.264) or WebM.` };
  if (!(input.size > 0)) return { error: "empty file" };
  if (input.size > VIDEO_MAX_BYTES) return { error: `Keep each file under ${Math.round(VIDEO_MAX_BYTES / 1024 ** 3)} GB` };
  sweepStale();
  const m: UploadManifest = { id: newId(), name: input.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 120) || "Untitled", type, ext, size: Math.floor(input.size), duration: Math.max(0, input.duration || 0), chunks: Math.ceil(input.size / CHUNK_BYTES), received: [], createdAt: now(), updatedAt: now() };
  // reserve the file at full length so chunks can land in any order
  const fd = fs.openSync(partPath(m.id), "w");
  try { fs.ftruncateSync(fd, m.size); } finally { fs.closeSync(fd); }
  writeManifest(m);
  return m;
}

export function writeChunk(id: string, index: number, data: Buffer): UploadManifest | { error: string; status?: number } {
  const m = readManifest(id);
  if (!m) return { error: "unknown upload; start it again", status: 404 };
  if (!Number.isInteger(index) || index < 0 || index >= m.chunks) return { error: "bad chunk index" };
  const expected = index === m.chunks - 1 ? m.size - index * CHUNK_BYTES : CHUNK_BYTES;
  if (data.length !== expected) return { error: `chunk ${index} should be ${expected} bytes, got ${data.length}` };
  const fd = fs.openSync(partPath(id), "r+");
  try { fs.writeSync(fd, data, 0, data.length, index * CHUNK_BYTES); } finally { fs.closeSync(fd); }
  fs.writeFileSync(markerPath(id, index), "");
  m.received = receivedChunks(id);
  return m;
}

export async function finishUpload(id: string): Promise<{ row: Awaited<ReturnType<typeof addVideo>> } | { error: string; missing?: number[] }> {
  const m = readManifest(id);
  if (!m) return { error: "unknown upload; start it again" };
  const have = new Set(m.received);
  const missing: number[] = [];
  for (let i = 0; i < m.chunks; i++) if (!have.has(i)) missing.push(i);
  if (missing.length) return { error: `${missing.length} chunk(s) still missing`, missing: missing.slice(0, 50) };
  const filename = `${m.id}.${m.ext}`;
  fs.renameSync(partPath(id), path.join(videoDir(), filename));
  try { fs.unlinkSync(manifestPath(id)); } catch { /* fine */ }
  for (let i = 0; i < m.chunks; i++) { try { fs.unlinkSync(markerPath(id, i)); } catch { /* fine */ } }
  const row = await addVideo({ id: m.id, title: m.name, kind: "file", src: filename, mime: m.type, bytes: m.size, duration: m.duration });
  return { row };
}
export function abandonUpload(id: string) {
  if (!safeId(id)) return;
  try { fs.unlinkSync(partPath(id)); } catch { /* gone */ }
  try { fs.unlinkSync(manifestPath(id)); } catch { /* gone */ }
  for (const f of fs.readdirSync(dir())) if (f.startsWith(`${id}.`) && f.endsWith(".ok")) { try { fs.unlinkSync(path.join(dir(), f)); } catch { /* gone */ } }
}
