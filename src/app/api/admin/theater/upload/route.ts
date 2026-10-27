import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { NextResponse } from "next/server";
import { audit } from "@/lib/auth";
import { addVideo, videoDir, VIDEO_MAX_BYTES, VIDEO_TYPES } from "@/lib/theater";
import { newId } from "@/lib/util";
import { bad, guard } from "../../_lib";
export const dynamic = "force-dynamic";

/**
 * Upload a film: the raw file is the request body (streamed straight to disk, so size is limited only by the disk
 * and VIDEO_MAX_BYTES), with ?name=, ?type=, ?duration= describing it. Returns the new playlist row.
 */
export async function PUT(req: Request) {
  const g = await guard(); if (g instanceof NextResponse) return g;
  const sp = new URL(req.url).searchParams;
  const type = (sp.get("type") || req.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  const ext = VIDEO_TYPES[type];
  if (!ext) return bad(`Unsupported video type "${type || "unknown"}". Use MP4 (H.264) or WebM.`);
  const declared = Number(req.headers.get("content-length") || sp.get("size") || 0);
  if (declared > VIDEO_MAX_BYTES) return bad(`Keep each file under ${Math.round(VIDEO_MAX_BYTES / 1024 ** 3)} GB`);
  if (!req.body) return bad("no file");
  const id = newId();
  const filename = `${id}.${ext}`;
  const dest = path.join(videoDir(), filename);
  let bytes = 0;
  const counter = new (await import("node:stream")).Transform({
    transform(chunk, _enc, cb) { bytes += chunk.length; if (bytes > VIDEO_MAX_BYTES) cb(new Error("too large")); else cb(null, chunk); },
  });
  try {
    await pipeline(Readable.fromWeb(req.body as import("node:stream/web").ReadableStream), counter, fs.createWriteStream(dest));
  } catch (e) {
    try { fs.unlinkSync(dest); } catch { /* nothing to clean */ }
    return bad((e as Error).message === "too large" ? `Keep each file under ${Math.round(VIDEO_MAX_BYTES / 1024 ** 3)} GB` : "Upload failed; try again");
  }
  if (bytes === 0) { try { fs.unlinkSync(dest); } catch { /* nothing */ } return bad("empty file"); }
  const name = (sp.get("name") || "Untitled").replace(/\.[a-z0-9]+$/i, "").slice(0, 120);
  const row = await addVideo({ id, title: name, kind: "file", src: filename, mime: type, bytes, duration: Number(sp.get("duration")) || 0 });
  await audit(g.id, "theater.upload", "theater_video", row.id, null, { title: row.title, bytes, type }, g.email);
  return NextResponse.json({ row });
}
