import { NextResponse } from "next/server";
import { readManifest, CHUNK_BYTES } from "@/lib/theater-upload";
import { guard, notFound } from "../../../_lib";
export const dynamic = "force-dynamic";
/** Which chunks of an unfinished upload have landed, so the browser can resume after a drop or a reload. */
export async function GET(req: Request) {
  const g = await guard("theater"); if (g instanceof NextResponse) return g;
  const m = readManifest(new URL(req.url).searchParams.get("id") || "");
  if (!m) return notFound();
  return NextResponse.json({ id: m.id, name: m.name, size: m.size, chunkBytes: CHUNK_BYTES, chunks: m.chunks, received: m.received });
}
