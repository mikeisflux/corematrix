import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { ART_MAX_UPLOAD, isArtSlot, normalizeArt } from "@/lib/art";

export const dynamic = "force-dynamic";

/** Normalises an uploaded image for a banner slot and returns it as a data URL for preview; /api/booth/[id]/art saves it. */
export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const slot = form?.get("slot");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (!isArtSlot(slot)) return NextResponse.json({ error: "Unknown slot" }, { status: 400 });
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return NextResponse.json({ error: "Use PNG, JPG or WebP (PDFs are converted in your browser first)" }, { status: 400 });
  if (file.size > ART_MAX_UPLOAD) return NextResponse.json({ error: "Keep the file under 12 MB" }, { status: 400 });
  try {
    const art = await normalizeArt(Buffer.from(await file.arrayBuffer()), slot);
    return NextResponse.json({ url: `data:${art.mime};base64,${art.data}`, width: art.width, height: art.height });
  } catch (e) {
    return NextResponse.json({ error: `Couldn't read that image: ${(e as Error).message}` }, { status: 400 });
  }
}
