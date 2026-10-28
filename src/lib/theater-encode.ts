/**
 * Downsampling for the screen. After an upload (or on demand) ffmpeg, when it
 * is installed on the server, turns the film into a streaming-friendly MP4:
 * H.264 at most 720p and ~2.5 Mbps, AAC audio, moov atom up front so the
 * browser can start and seek instantly. Films that are already small are only
 * remuxed. Runs one at a time in the background; the screen skips a film
 * while it is being processed and the original is kept until the new file is in.
 */
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { getVideo, updateVideo, videoDir, videoPath, listVideos, type TheaterVideo } from "@/lib/theater";

export const TARGET_HEIGHT = 720;
export const TARGET_KBPS = 2500;
const g = globalThis as unknown as { __fccEncodeQueue?: string[]; __fccEncoding?: string | null; __fccFfmpeg?: string | null };

/** The ffmpeg binary, or null when the server has none (FFMPEG_PATH overrides the lookup). */
export function ffmpegPath(): string | null {
  if (g.__fccFfmpeg !== undefined) return g.__fccFfmpeg;
  const candidates = [process.env.FFMPEG_PATH, "ffmpeg", "/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg"].filter(Boolean) as string[];
  for (const c of candidates) { try { if (spawnSync(c, ["-version"], { stdio: "ignore" }).status === 0) { g.__fccFfmpeg = c; return c; } } catch { /* next */ } }
  g.__fccFfmpeg = null;
  return null;
}
const ffprobePath = () => { const f = ffmpegPath(); return f ? f.replace(/ffmpeg(\.exe)?$/, "ffprobe$1") : null; };

interface Probe { codec: string; width: number; height: number; kbps: number }
function probe(file: string): Probe | null {
  const fp = ffprobePath(); if (!fp) return null;
  try {
    const r = spawnSync(fp, ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name,width,height:format=bit_rate", "-of", "json", file], { encoding: "utf8" });
    if (r.status !== 0) return null;
    const j = JSON.parse(r.stdout) as { streams?: { codec_name?: string; width?: number; height?: number }[]; format?: { bit_rate?: string } };
    const s = j.streams?.[0] ?? {};
    return { codec: s.codec_name ?? "", width: s.width ?? 0, height: s.height ?? 0, kbps: Math.round(Number(j.format?.bit_rate ?? 0) / 1000) };
  } catch { return null; }
}

/** Queue a film for processing; returns false when the server has no ffmpeg. */
export async function requestEncode(id: string): Promise<boolean> {
  if (!ffmpegPath()) return false;
  const row = await getVideo(id);
  if (!row || row.kind !== "file") return false;
  await updateVideo(id, { status: "processing" });
  const q = (g.__fccEncodeQueue ??= []);
  if (!q.includes(id) && g.__fccEncoding !== id) q.push(id);
  void pump();
  return true;
}
/** Films left "processing" by a restart get queued again. */
export async function resumeEncodes(): Promise<void> {
  if (!ffmpegPath()) return;
  const rows = await listVideos();
  for (const r of rows) if (r.status === "processing" && r.kind === "file") { const q = (g.__fccEncodeQueue ??= []); if (!q.includes(r.id) && g.__fccEncoding !== r.id) q.push(r.id); }
  void pump();
}
export const encodeState = () => ({ encoding: g.__fccEncoding ?? null, queued: g.__fccEncodeQueue ?? [] });

async function pump() {
  if (g.__fccEncoding) return;
  const q = g.__fccEncodeQueue ?? [];
  const id = q.shift();
  if (!id) return;
  g.__fccEncoding = id;
  try { await encodeOne(id); } catch (e) { console.error("[theater] encode failed", id, (e as Error).message); await updateVideo(id, { status: "ready" }); }
  g.__fccEncoding = null;
  void pump();
}

async function encodeOne(id: string) {
  const ff = ffmpegPath(); const row = await getVideo(id);
  if (!ff || !row || row.kind !== "file") return;
  const src = videoPath(row);
  if (!fs.existsSync(src)) { await updateVideo(id, { status: "ready" }); return; }
  const info = probe(src);
  const small = !!info && info.codec === "h264" && info.height <= TARGET_HEIGHT && info.kbps > 0 && info.kbps <= TARGET_KBPS * 1.4;
  const out = path.join(videoDir(), `${id}.enc.mp4`);
  const args = ["-y", "-hide_banner", "-loglevel", "error", "-i", src,
    ...(small
      ? ["-c:v", "copy"]
      : ["-c:v", "libx264", "-preset", "veryfast", "-profile:v", "main", "-level", "4.0", "-pix_fmt", "yuv420p",
         "-vf", `scale=-2:'min(${TARGET_HEIGHT},ih)'`, "-crf", "23", "-maxrate", `${TARGET_KBPS}k`, "-bufsize", `${TARGET_KBPS * 2}k`, "-g", "48"]),
    "-c:a", "aac", "-b:a", "128k", "-ac", "2", "-movflags", "+faststart", "-map_metadata", "-1", out];
  await new Promise<void>((resolve, reject) => {
    const child = spawn(ff, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    child.stderr.on("data", (d) => { err += String(d); });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(err.trim().slice(-400) || `ffmpeg exit ${code}`))));
  });
  const bytes = fs.statSync(out).size;
  if (bytes === 0) throw new Error("empty output");
  const final = `${id}.mp4`;
  fs.renameSync(out, path.join(videoDir(), final));
  if (row.src !== final) { try { fs.unlinkSync(src); } catch { /* fine */ } }
  await updateVideo(id, { status: "ready", src: final, mime: "video/mp4", bytes });
}
/** A freshly uploaded film gets processed unless it is already screen-friendly. */
export async function processAfterUpload(row: TheaterVideo): Promise<void> {
  if (!ffmpegPath() || row.kind !== "file") return;
  await requestEncode(row.id);
}
