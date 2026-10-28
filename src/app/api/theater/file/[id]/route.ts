import fs from "node:fs";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { getVideo, videoPath } from "@/lib/theater";
export const dynamic = "force-dynamic";

/** Streams an uploaded film with byte ranges, so the screen can seek to the synced moment and the browser can buffer ahead. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const row = await getVideo(id);
  if (!row || row.kind !== "file") return new NextResponse("not found", { status: 404 });
  const file = videoPath(row);
  let size: number;
  try { size = fs.statSync(file).size; } catch { return new NextResponse("file missing", { status: 404 }); }
  const type = row.mime || "video/mp4";
  const base = { "Content-Type": type, "Accept-Ranges": "bytes", "Cache-Control": "public, max-age=3600" };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (!range) {
    return new NextResponse(Readable.toWeb(fs.createReadStream(file, { highWaterMark: 1 << 20 })) as ReadableStream, { status: 200, headers: { ...base, "Content-Length": String(size) } });
  }
  let start = range[1] ? Number(range[1]) : 0;
  let end = range[2] ? Number(range[2]) : size - 1;
  if (!range[1] && range[2]) { start = Math.max(0, size - Number(range[2])); end = size - 1; }
  end = Math.min(end, size - 1);
  if (start > end || start >= size) return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  return new NextResponse(Readable.toWeb(fs.createReadStream(file, { start, end, highWaterMark: 1 << 20 })) as ReadableStream, {
    status: 206,
    headers: { ...base, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
  });
}
