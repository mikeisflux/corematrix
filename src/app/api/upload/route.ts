import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";

/**
 * Logo upload. Raster images are fitted (never cropped) and centred on a
 * transparent 512×512 canvas with sharp, so any shape of logo looks right on
 * the floor; SVGs are drawn to PNG too. Returns a data URL to store on the booth.
 */
export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (!["image/png", "image/jpeg", "image/webp", "image/svg+xml", "image/gif"].includes(file.type)) {
    return NextResponse.json({ error: "Use PNG, JPG, WebP, GIF or SVG" }, { status: 400 });
  }
  if (file.size > 8_000_000) return NextResponse.json({ error: "Keep logos under 8 MB" }, { status: 400 });
  const buf = Buffer.from(await file.arrayBuffer());
  // SVGs are drawn to a PNG like everything else: a stored SVG was refused when saving, so the logo silently never changed
  if (file.type === "image/svg+xml" && buf.length > 300_000) return NextResponse.json({ error: "Keep SVG logos under 300 KB" }, { status: 400 });
  try {
    const sharp = (await import("sharp")).default;
    const png = await sharp(buf, { failOn: "none", animated: false }).rotate()
      .resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 }).toBuffer();
    return NextResponse.json({ url: `data:image/png;base64,${png.toString("base64")}` });
  } catch (e) {
    return NextResponse.json({ error: `Couldn't read that image: ${(e as Error).message}` }, { status: 400 });
  }
}
