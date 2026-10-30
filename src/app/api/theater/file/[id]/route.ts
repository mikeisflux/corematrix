import fs from "node:fs";
import { NextResponse } from "next/server";
import { getVideo, videoPath } from "@/lib/theater";
export const dynamic = "force-dynamic";

/**
 * Bytes start..end of a file as a pull-based web stream: one chunk is read per pull, and a viewer who goes away closes
 * the file. Readable.toWeb() kept pushing into a cancelled stream on some Node versions ("Invalid state: Controller is
 * already closed" as an uncaught exception every time a browser dropped a video request, which it does on every seek).
 */
function fileStream(file: string, start: number, end: number): ReadableStream<Uint8Array> {
  const CHUNK = 256 * 1024;
  let fh: fs.promises.FileHandle | null = null;
  let pos = start, done = false;
  const close = () => { done = true; const h = fh; fh = null; void h?.close().catch(() => {}); };
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (done) return;
      try {
        fh ??= await fs.promises.open(file, "r");
        const want = Math.min(CHUNK, end - pos + 1);
        const buf = new Uint8Array(want);
        const { bytesRead } = await fh.read(buf, 0, want, pos);
        if (done) return; // cancelled while reading
        if (bytesRead <= 0) { close(); controller.close(); return; }
        pos += bytesRead;
        controller.enqueue(bytesRead === want ? buf : buf.subarray(0, bytesRead));
        if (pos > end) { close(); controller.close(); }
      } catch (e) {
        if (!done) { close(); try { controller.error(e); } catch { /* already closed */ } }
      }
    },
    cancel() { close(); },
  });
}

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
    return new NextResponse(fileStream(file, 0, size - 1), { status: 200, headers: { ...base, "Content-Length": String(size) } });
  }
  let start = range[1] ? Number(range[1]) : 0;
  let end = range[2] ? Number(range[2]) : size - 1;
  if (!range[1] && range[2]) { start = Math.max(0, size - Number(range[2])); end = size - 1; }
  end = Math.min(end, size - 1);
  if (start > end || start >= size) return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
  return new NextResponse(fileStream(file, start, end), {
    status: 206,
    headers: { ...base, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
  });
}
