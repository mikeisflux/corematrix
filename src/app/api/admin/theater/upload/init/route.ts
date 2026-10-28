import { NextResponse } from "next/server";
import { beginUpload, CHUNK_BYTES } from "@/lib/theater-upload";
import { bad, guard, readJson } from "../../../_lib";
export const dynamic = "force-dynamic";
/** Start a resumable upload: returns the upload id and chunk size; the file is sent as numbered chunks after this. */
export async function POST(req: Request) {
  const g = await guard("theater"); if (g instanceof NextResponse) return g;
  const b = await readJson<{ name?: string; type?: string; size?: number; duration?: number }>(req);
  const m = beginUpload({ name: String(b.name || "Untitled"), type: String(b.type || ""), size: Number(b.size), duration: Number(b.duration) || 0 });
  if ("error" in m) return bad(m.error);
  return NextResponse.json({ id: m.id, chunkBytes: CHUNK_BYTES, chunks: m.chunks });
}
