/**
 * Encoding for the screen. After an upload (or on demand) ffmpeg, when it is
 * installed on the server, turns the film into two things:
 *  - an HLS stream (<id>.hls-<stamp>/master.m3u8): 4-second fMP4 segments in a
 *    ladder of 360p ~600 kbps and 720p ~2 Mbps, so the player picks the rung
 *    the viewer's connection can carry and fetches small whole files instead of
 *    byte ranges of one big one. This is what the screen plays.
 *  - a streaming-friendly MP4 (H.264 at most 720p and ~2.5 Mbps, AAC, moov atom
 *    up front) as the fallback for browsers without Media Source Extensions.
 * Films that are already small are only remuxed for the MP4. Runs one at a time
 * in the background; the screen skips a film while it is being processed and
 * the original is kept until the new files are in.
 */
import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { getVideo, updateVideo, videoDir, videoPath, listVideos, hlsDirPath, type TheaterVideo } from "@/lib/theater";

export const TARGET_HEIGHT = 720;
export const TARGET_KBPS = 2500;
/** The HLS rungs; a rung taller than the source is skipped (the lowest always stays). */
const LADDER = [{ h: 360, kbps: 600 }, { h: 720, kbps: 2000 }];
const SEGMENT_SECONDS = 4;
const g = globalThis as unknown as { __fccEncodeQueue?: string[]; __fccEncoding?: string | null; __fccFfmpeg?: string | null; __fccEncodeErrors?: Record<string, string> };
/** Why the last encode of a film failed, shown on Admin → Theater until the next attempt (in memory: a restart clears it). */
const errors = () => (g.__fccEncodeErrors ??= {});

/** The ffmpeg binary, or null when the server has none (FFMPEG_PATH overrides the lookup). */
export function ffmpegPath(): string | null {
  if (g.__fccFfmpeg !== undefined) return g.__fccFfmpeg;
  if (process.env.THEATER_ENCODE === "off") { g.__fccFfmpeg = null; return null; } // play uploads as they are
  const candidates = [process.env.FFMPEG_PATH, "ffmpeg", "/usr/bin/ffmpeg", "/usr/local/bin/ffmpeg"].filter(Boolean) as string[];
  for (const c of candidates) { try { if (spawnSync(c, ["-version"], { stdio: "ignore" }).status === 0) { g.__fccFfmpeg = c; return c; } } catch { /* next */ } }
  g.__fccFfmpeg = null;
  return null;
}
const ffprobePath = () => { const f = ffmpegPath(); return f ? f.replace(/ffmpeg(\.exe)?$/, "ffprobe$1") : null; };

interface Probe { codec: string; width: number; height: number; kbps: number; audio: boolean }
function probe(file: string): Probe | null {
  const fp = ffprobePath(); if (!fp) return null;
  try {
    const r = spawnSync(fp, ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name,width,height:format=bit_rate", "-of", "json", file], { encoding: "utf8" });
    if (r.status !== 0) return null;
    const j = JSON.parse(r.stdout) as { streams?: { codec_name?: string; width?: number; height?: number }[]; format?: { bit_rate?: string } };
    const s = j.streams?.[0] ?? {};
    const a = spawnSync(fp, ["-v", "error", "-select_streams", "a", "-show_entries", "stream=codec_type", "-of", "csv=p=0", file], { encoding: "utf8" });
    return { codec: s.codec_name ?? "", width: s.width ?? 0, height: s.height ?? 0, kbps: Math.round(Number(j.format?.bit_rate ?? 0) / 1000), audio: a.status === 0 && a.stdout.trim().length > 0 };
  } catch { return null; }
}

/** ffmpeg at the lowest CPU priority: a feature-length encode takes about as long as the film on a small server, and the
 *  site must stay responsive for everyone walking the floor meanwhile. */
function run(ff: string, args: string[]): Promise<void> {
  const nice = process.platform !== "win32" && fs.existsSync("/usr/bin/nice");
  return new Promise<void>((resolve, reject) => {
    const child = nice ? spawn("/usr/bin/nice", ["-n", "19", ff, ...args], { stdio: ["ignore", "ignore", "pipe"] }) : spawn(ff, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    child.stderr.on("data", (d) => { err += String(d); });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(err.trim().slice(-1200) || `ffmpeg exit ${code}`))));
  });
}

/** One ffmpeg pass writes every rung of the ladder and the master playlist into a fresh, stamped folder. */
async function encodeHls(ff: string, src: string, id: string, info: Probe | null): Promise<string> {
  const name = `${id}.hls-${Date.now()}`;
  const dir = hlsDirPath(name);
  if (!dir) throw new Error("bad hls folder name");
  fs.mkdirSync(dir, { recursive: true });
  const srcH = info?.height || TARGET_HEIGHT;
  const rungs = LADDER.filter((r, i) => i === 0 || r.h <= srcH);
  const audio = info?.audio ?? true;
  const filter = rungs.length === 1
    ? `[0:v]scale=-2:'min(${rungs[0].h},ih)'[v0]`
    : `[0:v]split=${rungs.length}${rungs.map((_, i) => `[i${i}]`).join("")};${rungs.map((r, i) => `[i${i}]scale=-2:'min(${r.h},ih)'[v${i}]`).join(";")}`;
  const args = ["-y", "-hide_banner", "-loglevel", "error", "-i", src, "-filter_complex", filter,
    ...rungs.flatMap((_, i) => ["-map", `[v${i}]`, ...(audio ? ["-map", "0:a:0"] : [])]),
    "-c:v", "libx264", "-preset", "veryfast", "-profile:v", "main", "-pix_fmt", "yuv420p",
    // a keyframe every 2 s whatever the frame rate, and none on scene cuts, so every segment starts on one
    "-force_key_frames", "expr:gte(t,n_forced*2)", "-sc_threshold", "0",
    ...rungs.flatMap((r, i) => [`-b:v:${i}`, `${r.kbps}k`, `-maxrate:v:${i}`, `${Math.round(r.kbps * 1.2)}k`, `-bufsize:v:${i}`, `${r.kbps * 2}k`]),
    ...(audio ? ["-c:a", "aac", "-b:a", "96k", "-ac", "2"] : ["-an"]),
    "-f", "hls", "-hls_time", String(SEGMENT_SECONDS), "-hls_playlist_type", "vod", "-hls_flags", "independent_segments",
    // ffmpeg only expands %v in the init name when there is more than one variant; a lone rung got a literal "init_%v.mp4"
    "-hls_segment_type", "fmp4", "-hls_fmp4_init_filename", rungs.length > 1 ? "init_%v.mp4" : "init_0.mp4",
    "-master_pl_name", "master.m3u8", "-var_stream_map", rungs.map((_, i) => (audio ? `v:${i},a:${i}` : `v:${i}`)).join(" "),
    "-hls_segment_filename", path.join(dir, "s%v_%03d.m4s"), path.join(dir, "v%v.m3u8")];
  try {
    await run(ff, args);
    if (!fs.existsSync(path.join(dir, "master.m3u8"))) throw new Error("no master playlist written");
  } catch (e) { fs.rmSync(dir, { recursive: true, force: true }); throw e; }
  return name;
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
export const encodeState = () => ({ encoding: g.__fccEncoding ?? null, queued: g.__fccEncodeQueue ?? [], errors: { ...errors() } });

async function pump() {
  if (g.__fccEncoding) return;
  const q = g.__fccEncodeQueue ?? [];
  const id = q.shift();
  if (!id) return;
  g.__fccEncoding = id;
  delete errors()[id];
  try { await encodeOne(id); } catch (e) { const msg = (e as Error).message; errors()[id] = msg; console.error("[theater] encode failed", id, msg); await updateVideo(id, { status: "ready" }); }
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
         "-vf", `scale=-2:'min(${TARGET_HEIGHT},ih)'`, "-crf", "23", "-maxrate", `${TARGET_KBPS}k`, "-bufsize", `${TARGET_KBPS * 2}k`, "-force_key_frames", "expr:gte(t,n_forced*2)", "-sc_threshold", "0"]),
    "-c:a", "aac", "-b:a", "128k", "-ac", "2", "-movflags", "+faststart", "-map_metadata", "-1", out];
  await run(ff, args);
  const bytes = fs.statSync(out).size;
  if (bytes === 0) throw new Error("empty output");
  // the stream comes from the original, not the downsampled MP4, so the 720p rung isn't a second-generation encode
  let hls: string | null = null;
  try { hls = await encodeHls(ff, src, id, info); } catch (e) { const msg = `stream (HLS) step: ${(e as Error).message}`; errors()[id] = msg; console.error("[theater] hls encode failed", id, msg); }
  const final = `${id}.mp4`;
  fs.renameSync(out, path.join(videoDir(), final));
  if (row.src !== final) { try { fs.unlinkSync(src); } catch { /* fine */ } }
  const old = row.hls && row.hls !== hls ? hlsDirPath(row.hls) : null;
  if (old && hls) fs.rmSync(old, { recursive: true, force: true });
  await updateVideo(id, { status: "ready", src: final, mime: "video/mp4", bytes, ...(hls ? { hls } : {}) });
}
/** A freshly uploaded film gets processed unless it is already screen-friendly. */
export async function processAfterUpload(row: TheaterVideo): Promise<void> {
  if (!ffmpegPath() || row.kind !== "file") return;
  await requestEncode(row.id);
}
