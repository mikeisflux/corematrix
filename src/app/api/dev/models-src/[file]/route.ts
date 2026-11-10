import { NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";

/** Development only: serves models-src/*.glb (the skinned bodies the avatar GLBs are assembled from) to /dev/models. */
export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  if (process.env.NODE_ENV !== "development") return new NextResponse("Not found", { status: 404 });
  const { file } = await params;
  if (!/^[\w.-]+\.glb$/.test(file)) return new NextResponse("Not found", { status: 404 });
  try {
    const buf = await fs.readFile(path.join(process.cwd(), "models-src", file));
    return new NextResponse(new Uint8Array(buf), { headers: { "content-type": "model/gltf-binary", "cache-control": "no-store" } });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
