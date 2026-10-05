import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { guard, notFound } from "../../../_lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard(); if (g instanceof NextResponse) return g;
  const { id } = await ctx.params;
  const [a] = await db.select().from(schema.mailAttachments).where(eq(schema.mailAttachments.id, id));
  if (!a) return notFound();
  const inline = new URL(req.url).searchParams.get("inline") === "1";
  const safe = a.filename.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
  return new NextResponse(new Uint8Array(a.data), { headers: { "Content-Type": a.contentType || "application/octet-stream", "Content-Length": String(a.size), "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${safe}"; filename*=UTF-8''${encodeURIComponent(a.filename)}`, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, max-age=3600" } });
}
