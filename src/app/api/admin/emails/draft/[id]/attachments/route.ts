import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { newId } from "@/lib/util";
import { guard, bad, notFound, readJson } from "../../../../_lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const LIMIT = 10 * 1024 * 1024;
type Ctx = { params: Promise<{ id: string }> };
const sel = { id: schema.mailAttachments.id, filename: schema.mailAttachments.filename, contentType: schema.mailAttachments.contentType, size: schema.mailAttachments.size, inline: schema.mailAttachments.inline };
async function draft(id: string) {
  const [d] = await db.select({ id: schema.mailMessages.id }).from(schema.mailMessages).where(and(eq(schema.mailMessages.id, id), eq(schema.mailMessages.status, "draft")));
  return d ?? null;
}
export async function POST(req: Request, ctx: Ctx) {
  const g = await guard(); if (g instanceof NextResponse) return g;
  const { id } = await ctx.params;
  if (!(await draft(id))) return notFound();
  let fd: FormData;
  try { fd = await req.formData(); } catch { return bad("multipart form expected"); }
  const existing = await db.select({ size: schema.mailAttachments.size }).from(schema.mailAttachments).where(eq(schema.mailAttachments.messageId, id));
  let total = existing.reduce((n, a) => n + a.size, 0);
  const rows = [];
  for (const f of fd.getAll("files")) {
    if (!(f instanceof File) || !f.size) continue;
    total += f.size;
    if (total > LIMIT) return bad("Attachments exceed 10 MB total.", 413);
    rows.push({ id: newId(), messageId: id, filename: f.name.slice(0, 255), contentType: f.type || "application/octet-stream", size: f.size, data: Buffer.from(await f.arrayBuffer()), inline: false, contentId: null });
  }
  if (rows.length) await db.insert(schema.mailAttachments).values(rows);
  const attachments = await db.select(sel).from(schema.mailAttachments).where(eq(schema.mailAttachments.messageId, id));
  return NextResponse.json({ attachments, total });
}
export async function DELETE(req: Request, ctx: Ctx) {
  const g = await guard(); if (g instanceof NextResponse) return g;
  const { id } = await ctx.params;
  if (!(await draft(id))) return notFound();
  const b = await readJson<{ attachmentId?: string }>(req);
  if (!b.attachmentId) return bad("attachmentId required");
  await db.delete(schema.mailAttachments).where(and(eq(schema.mailAttachments.id, String(b.attachmentId)), eq(schema.mailAttachments.messageId, id)));
  const attachments = await db.select(sel).from(schema.mailAttachments).where(eq(schema.mailAttachments.messageId, id));
  return NextResponse.json({ attachments });
}
