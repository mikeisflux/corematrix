import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { sanitizeHtml } from "@/components/admin/sanitize";
import { newId, now } from "@/lib/util";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function keyOk(provided: string | null, expected: string) {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
function parseAddress(raw: string): { email: string; name: string | null } {
  const m = raw.match(/^\s*"?([^"<]*)"?\s*<([^>]+)>/);
  if (m) return { email: m[2].trim().toLowerCase(), name: m[1].trim() || null };
  return { email: raw.trim().replace(/^<|>$/g, "").toLowerCase(), name: null };
}
function parseHeaders(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of raw.replace(/\r\n[ \t]+/g, " ").split(/\r?\n/)) {
    const i = line.indexOf(":");
    if (i > 0) { const k = line.slice(0, i).trim(); if (!out[k]) out[k] = line.slice(i + 1).trim(); }
  }
  return out;
}

/* SendGrid Inbound Parse (multipart). Fields: from, to, cc, subject, text, html,
   headers, attachments (count), attachment1..N, attachment-info (JSON), envelope. */
export async function POST(req: Request) {
  await ensureMigrated();
  const expected = await getSetting("INBOUND_EMAIL_KEY");
  if (!keyOk(new URL(req.url).searchParams.get("key"), expected)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  let fd: FormData;
  try { fd = await req.formData(); } catch { return NextResponse.json({ error: "multipart expected" }, { status: 400 }); }
  const s = (k: string) => { const v = fd.get(k); return typeof v === "string" ? v : ""; };
  const from = parseAddress(s("from") || "unknown@unknown");
  const subject = (s("subject") || "(no subject)").slice(0, 500);
  const text = s("text") || null;
  const rawHtml = s("html");
  const html = rawHtml ? sanitizeHtml(rawHtml) : null;
  const headers = parseHeaders(s("headers"));
  let info: Record<string, { filename?: string; type?: string; "content-id"?: string }> = {};
  try { info = JSON.parse(s("attachment-info") || "{}"); } catch { /* ignore */ }

  /* Thread matching: In-Reply-To / References against our ids, then our outbound to this sender with the same subject. */
  const bare = subject.replace(/^(\s*(re|fwd?|aw)\s*:\s*)+/i, "").trim();
  let threadId: string | null = null;
  const inReplyTo = headers["In-Reply-To"] || headers["References"];
  if (inReplyTo) {
    const ids = inReplyTo.match(/<([^>]+)>/g)?.map((x) => x.slice(1, -1).split("@")[0]) ?? [];
    if (ids.length) {
      const [m] = await db.select({ id: schema.mailMessages.id, threadId: schema.mailMessages.threadId }).from(schema.mailMessages).where(or(inArray(schema.mailMessages.id, ids), inArray(schema.mailMessages.sendgridMessageId, ids))).limit(1);
      if (m) threadId = m.threadId || m.id;
    }
  }
  if (!threadId && bare) {
    const [m] = await db.select({ id: schema.mailMessages.id, threadId: schema.mailMessages.threadId }).from(schema.mailMessages)
      .where(and(eq(schema.mailMessages.direction, "out"), sql`lower(${schema.mailMessages.toEmail}) LIKE ${"%" + from.email + "%"}`, sql`lower(${schema.mailMessages.subject}) = ${bare.toLowerCase()}`))
      .orderBy(desc(schema.mailMessages.createdAt)).limit(1);
    if (m) threadId = m.threadId || m.id;
  }
  if (!threadId && bare !== subject) {
    const [m] = await db.select({ id: schema.mailMessages.id, threadId: schema.mailMessages.threadId }).from(schema.mailMessages)
      .where(and(eq(schema.mailMessages.direction, "in"), eq(schema.mailMessages.fromEmail, from.email), sql`lower(${schema.mailMessages.subject}) IN (${bare.toLowerCase()}, ${subject.toLowerCase()})`))
      .orderBy(schema.mailMessages.createdAt).limit(1);
    if (m) threadId = m.threadId || m.id;
  }

  const count = Math.min(50, Number(s("attachments") || 0) || 0);
  const attachments: Array<{ id: string; filename: string; contentType: string; size: number; data: Buffer; inline: boolean; contentId: string | null }> = [];
  for (let i = 1; i <= Math.max(count, 0) + 5; i++) {
    const f = fd.get(`attachment${i}`);
    if (!(f instanceof File)) { if (i > count) break; continue; }
    const meta = info[`attachment${i}`] || {};
    const cid = meta["content-id"] ? String(meta["content-id"]).replace(/^<|>$/g, "") : null;
    attachments.push({ id: newId(), filename: (meta.filename || f.name || `attachment${i}`).slice(0, 255), contentType: (meta.type || f.type || "application/octet-stream").slice(0, 120), size: f.size, data: Buffer.from(await f.arrayBuffer()), inline: !!cid && !!html && html.includes(`cid:${cid}`), contentId: cid });
  }

  const [user] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.email, from.email)).limit(1);
  const id = newId();
  await db.insert(schema.mailMessages).values({
    id, direction: "in", channel: "email", fromEmail: from.email, fromName: from.name, toEmail: s("to").slice(0, 500) || null, cc: s("cc").slice(0, 500) || null,
    subject, text, html, read: false, threadId, status: "received", userId: user?.id ?? null,
    headers: JSON.stringify({ ...headers, envelope: s("envelope") || undefined, spamScore: s("spam_score") || undefined, dkim: s("dkim") || undefined, spf: s("SPF") || undefined }),
    createdAt: now(),
  });
  if (attachments.length) await db.insert(schema.mailAttachments).values(attachments.map((a) => ({ ...a, messageId: id })));
  if (html && attachments.some((a) => a.inline)) {
    let out = html;
    for (const a of attachments) if (a.inline && a.contentId) out = out.split(`cid:${a.contentId}`).join(`/api/admin/emails/attachments/${a.id}?inline=1`);
    if (out !== html) await db.update(schema.mailMessages).set({ html: out }).where(eq(schema.mailMessages.id, id));
  }
  return NextResponse.json({ ok: true, id, threadId, attachments: attachments.length });
}
