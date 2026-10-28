import { NextResponse } from "next/server";
import { audit } from "@/lib/auth";
import { abandonUpload, finishUpload } from "@/lib/theater-upload";
import { bad, guard, readJson } from "../../../_lib";
export const dynamic = "force-dynamic";
/** All chunks are in: assemble the film into the playlist. With {cancel:true} the half-finished upload is thrown away instead. */
export async function POST(req: Request) {
  const g = await guard(); if (g instanceof NextResponse) return g;
  const b = await readJson<{ id?: string; cancel?: boolean }>(req);
  const id = String(b.id || "");
  if (b.cancel) { abandonUpload(id); return NextResponse.json({ ok: true }); }
  const r = await finishUpload(id);
  if ("error" in r) return NextResponse.json({ error: r.error, missing: r.missing }, { status: 409 });
  await audit(g.id, "theater.upload", "theater_video", r.row.id, null, { title: r.row.title, bytes: r.row.bytes, type: r.row.mime }, g.email);
  return NextResponse.json({ row: r.row });
}
