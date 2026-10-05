import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { newId, now } from "@/lib/util";
import { guard, bad, notFound, readJson, str, optStr } from "../../_lib";

export const dynamic = "force-dynamic";
const LIMIT = 10 * 1024 * 1024;
interface DraftBody { id?: string; to?: string; cc?: string; bcc?: string; subject?: string; html?: string; threadId?: string; copyAttachmentsFrom?: string }
const attSelect = { id: schema.mailAttachments.id, filename: schema.mailAttachments.filename, contentType: schema.mailAttachments.contentType, size: schema.mailAttachments.size, inline: schema.mailAttachments.inline };

async function load(id: string) {
  const [row] = await db.select({ id: schema.mailMessages.id, toEmail: schema.mailMessages.toEmail, cc: schema.mailMessages.cc, subject: schema.mailMessages.subject, html: schema.mailMessages.html, threadId: schema.mailMessages.threadId, headers: schema.mailMessages.headers, createdAt: schema.mailMessages.createdAt }).from(schema.mailMessages).where(eq(schema.mailMessages.id, id));
  const attachments = await db.select(attSelect).from(schema.mailAttachments).where(eq(schema.mailAttachments.messageId, id));
  return { ...row, headers: row.headers ? JSON.parse(row.headers) : null, attachments };
}

/* POST — upsert a draft (mail row, direction "out", status "draft"). Bcc lives in headers.bcc. */
export async function POST(req: Request) {
  const g = await guard(); if (g instanceof NextResponse) return g;
  await ensureMigrated();
  const b = await readJson<DraftBody>(req);
  const fields = { toEmail: optStr(b.to, 2000), cc: optStr(b.cc, 2000), subject: str(b.subject, 300).trim(), html: str(b.html, 500_000), threadId: optStr(b.threadId, 64), headers: JSON.stringify({ bcc: str(b.bcc, 2000).trim(), draftUpdatedAt: new Date().toISOString() }) };
  if (b.id) {
    const [existing] = await db.select({ id: schema.mailMessages.id, status: schema.mailMessages.status }).from(schema.mailMessages).where(eq(schema.mailMessages.id, String(b.id)));
    if (!existing) return notFound();
    if (existing.status !== "draft") return bad("Not a draft");
    await db.update(schema.mailMessages).set(fields).where(eq(schema.mailMessages.id, existing.id));
    return NextResponse.json({ row: await load(existing.id) });
  }
  const s = await getSettings(["MAIL_FROM", "MAIL_FROM_NAME", "SITE_NAME"]);
  const id = newId();
  await db.insert(schema.mailMessages).values({ id, direction: "out", channel: fields.threadId ? "reply" : "email", status: "draft", read: true, fromEmail: s.MAIL_FROM || "no-reply@alwaysoncon.app", fromName: s.MAIL_FROM_NAME || s.SITE_NAME || "AlwaysOnCon", createdAt: now(), ...fields });
  if (b.copyAttachmentsFrom) {
    const src = await db.select().from(schema.mailAttachments).where(and(eq(schema.mailAttachments.messageId, String(b.copyAttachmentsFrom)), eq(schema.mailAttachments.inline, false)));
    let total = 0;
    const keep = src.filter((a) => { total += a.size; return total <= LIMIT; });
    if (keep.length) await db.insert(schema.mailAttachments).values(keep.map((a) => ({ id: newId(), messageId: id, filename: a.filename, contentType: a.contentType, size: a.size, data: a.data, inline: false, contentId: null })));
  }
  return NextResponse.json({ row: await load(id) });
}
