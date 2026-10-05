import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { audit } from "@/lib/auth";
import { sendMail, htmlToText } from "@/lib/sendgrid";
import { guard, bad, notFound, readJson } from "../../../../_lib";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
const EMAIL = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;
const emails = (s: unknown) => String(s ?? "").split(/[,;\n]+/).map((e) => { const m = e.match(/<([^>]+)>/); return (m ? m[1] : e).trim(); }).filter(Boolean);
function wrapHtml(html: string) {
  if (/<html[\s>]/i.test(html)) return html;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head><body style="margin:0;padding:24px;background:#ffffff;color:#111111;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55">${html}</body></html>`;
}
/* POST { testToMe?: boolean } — send a draft. On success the draft row is deleted and the new log id returned. */
export async function POST(req: Request, ctx: Ctx) {
  const g = await guard(); if (g instanceof NextResponse) return g;
  const { id } = await ctx.params;
  const [d] = await db.select().from(schema.mailMessages).where(and(eq(schema.mailMessages.id, id), eq(schema.mailMessages.status, "draft")));
  if (!d) return notFound();
  const atts = await db.select().from(schema.mailAttachments).where(eq(schema.mailAttachments.messageId, id));
  const b = await readJson<{ testToMe?: boolean }>(req);
  const testToMe = b.testToMe === true;
  const to = testToMe ? [g.email] : emails(d.toEmail);
  const bad1 = to.find((e) => !EMAIL.test(e));
  if (!to.length) return bad("At least one recipient is required.");
  if (bad1) return bad(`Invalid recipient: ${bad1}`);
  const cc = testToMe ? [] : emails(d.cc);
  const bcc = testToMe ? [] : emails((d.headers ? (JSON.parse(d.headers) as { bcc?: string }) : {}).bcc);
  const badCc = [...cc, ...bcc].find((e) => !EMAIL.test(e));
  if (badCc) return bad(`Invalid address: ${badCc}`);
  const subject = d.subject.trim();
  if (!subject) return bad("Subject is required.");
  const html = d.html || "";
  const text = htmlToText(html) || subject;
  const r = await sendMail({
    to, cc: cc.length ? cc : undefined, bcc: bcc.length ? bcc : undefined, subject: testToMe ? `[TEST] ${subject}` : subject, text, html: html ? wrapHtml(html) : undefined,
    attachments: atts.map((a) => ({ filename: a.filename, contentType: a.contentType, content: Buffer.from(a.data), inline: a.inline, contentId: a.contentId ?? undefined })),
    threadId: d.threadId ?? undefined, channel: d.threadId ? "reply" : "email",
  });
  await audit(g.id, testToMe ? "email.send_test" : "email.send", "message", r.logId ?? null, undefined, { draftId: id, to, subject, ok: r.ok, error: r.error }, g.email);
  if (!r.ok) {
    await db.update(schema.mailMessages).set({ statusMessage: r.error || "Send failed" }).where(eq(schema.mailMessages.id, id));
    return bad(r.error || "Send failed", 502);
  }
  if (!testToMe) { await db.delete(schema.mailAttachments).where(eq(schema.mailAttachments.messageId, id)); await db.delete(schema.mailMessages).where(eq(schema.mailMessages.id, id)); }
  return NextResponse.json({ ok: true, logId: r.logId, messageId: r.messageId });
}
