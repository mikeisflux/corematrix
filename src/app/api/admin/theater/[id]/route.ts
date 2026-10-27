import { NextResponse } from "next/server";
import { audit } from "@/lib/auth";
import { deleteVideo, updateVideo } from "@/lib/theater";
import { bad, guard, notFound, readJson } from "../../_lib";
export const dynamic = "force-dynamic";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard(); if (g instanceof NextResponse) return g;
  const { id } = await ctx.params;
  const b = await readJson<{ title?: string; enabled?: boolean; duration?: number }>(req);
  if (b.title !== undefined && typeof b.title !== "string") return bad("title must be text");
  const row = await updateVideo(id, { title: b.title, enabled: typeof b.enabled === "boolean" ? b.enabled : undefined, duration: typeof b.duration === "number" ? b.duration : undefined });
  if (!row) return notFound();
  return NextResponse.json({ row });
}
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard(); if (g instanceof NextResponse) return g;
  const { id } = await ctx.params;
  const row = await deleteVideo(id);
  if (!row) return notFound();
  await audit(g.id, "theater.delete", "theater_video", id, { title: row.title, src: row.src }, null, g.email);
  return NextResponse.json({ ok: true });
}
