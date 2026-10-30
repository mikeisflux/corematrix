import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { hlsDirPath } from "@/lib/theater";

export const dynamic = "force-dynamic";

/** Playlists and 4-second segments of an encoded film. Both names are checked against the exact shapes ffmpeg writes. */
const FILE = /^(master\.m3u8|v\d\.m3u8|init_\d\.mp4|s\d_\d{3,5}\.m4s)$/;

export async function GET(_req: Request, ctx: { params: Promise<{ dir: string; file: string }> }) {
  const { dir, file } = await ctx.params;
  const base = hlsDirPath(dir);
  if (!base || !FILE.test(file)) return new NextResponse("not found", { status: 404 });
  let data: Buffer;
  try { data = await fs.promises.readFile(path.join(base, file)); } catch { return new NextResponse("not found", { status: 404 }); }
  const playlist = file.endsWith(".m3u8");
  // the folder name carries the encode's timestamp, so segments never change under a URL: cache them for good.
  // Playlists are tiny; a short life lets a re-encode (new folder) show up within minutes anywhere they were cached.
  return new NextResponse(new Uint8Array(data), {
    headers: {
      "Content-Type": playlist ? "application/vnd.apple.mpegurl" : file.endsWith(".m4s") ? "video/iso.segment" : "video/mp4",
      "Cache-Control": playlist ? "public, max-age=300" : "public, max-age=31536000, immutable",
      "Content-Length": String(data.length),
    },
  });
}
