import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";

/** Accepts a small image and returns a data URL to store on the booth. */
export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "No file" }, { status: 400 });
  if (!["image/png", "image/jpeg", "image/webp", "image/svg+xml", "image/gif"].includes(file.type)) {
    return NextResponse.json({ error: "Use PNG, JPG, WebP, GIF or SVG" }, { status: 400 });
  }
  if (file.size > 300_000) return NextResponse.json({ error: "Keep logos under 300 KB" }, { status: 400 });
  const buf = Buffer.from(await file.arrayBuffer());
  return NextResponse.json({ url: `data:${file.type};base64,${buf.toString("base64")}` });
}
