import { NextResponse } from "next/server";
import { and, eq, isNull, ne, or } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/lib/db";
import { audit } from "@/lib/auth";
import { sendMail } from "@/lib/sendgrid";
import { getSetting } from "@/lib/settings";
import { guard, bad, notFound, readJson } from "../../_lib";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
const m = schema.mailMessages;

function parseJson<T>(s: string | null, fallback: T): T { try { return s ? (JSON.parse(s) as T) : fallback; } catch { return fallback; } }

/* GET → { row, thread, me } */
export async function GET(_req: Request, ctx: Ctx) {
  const g = await guard(); if (g instanceof NextResponse) return g;
  await ensureMigrated();
  const { id } = await ctx.params;
  const [row] = await db.select().from(m).where(eq(m.id, id)).limit(1);
  if (!row) return notFound();
  const attachments = await db.select({ id: schema.mailAttachments.id, filename: schema.mailAttachments.filename, contentType: schema.mailAttachments.contentType, size: schema.mailAttachments.size, inline: schema.mailAttachments.inline, contentId: schema.mailAttachments.contentId }).from(schema.mailAttachments).where(eq(schema.mailAttachments.messageId, id));
  const tid = row.threadId || row.id;
  const threadRows = await db.select().from(m).where(and(or(eq(m.threadId, tid), eq(m.id, tid)), ne(m.id, id), or(isNull(m.status), ne(m.status, "draft")))).orderBy(m.createdAt);
  const thread = await Promise.all(threadRows.map(async (t) => {
    const [c] = await db.select({ n: schema.mailAttachments.id }).from(schema.mailAttachments).where(eq(schema.mailAttachments.messageId, t.id));
    return { id: t.id, direction: t.direction, fromEmail: t.fromEmail, fromName: t.fromName, toEmail: t.toEmail, subject: t.subject, snippet: (t.text || "").replace(/\s+/g, " ").trim().slice(0, 140), createdAt: t.createdAt, status: t.status, read: t.read, attachmentCount: c ? 1 : 0 };
  }));
  const me = await getSetting("MAIL_FROM");
  return NextResponse.json({ row: { ...row, headers: parseJson<Record<string, string> | null>(row.headers, null), events: parseJson<unknown[] | null>(row.events, null), attachments, attachmentCount: attachments.length }, thread, me: me || "" });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const g = await guard(); if (g instanceof NextResponse) return g;
  const { id } = await ctx.params;
  const b = await readJson<{ read?: boolean; starred?: boolean; archived?: boolean }>(req);
  const data: { read?: boolean; starred?: boolean; archived?: boolean } = {};
  if (typeof b.read === "boolean") data.read = b.read;
  if (typeof b.starred === "boolean") data.starred = b.starred;
  if (typeof b.archived === "boolean") data.archived = b.archived;
  if (!Object.keys(data).length) return bad("nothing to update");
  const [row] = await db.update(m).set(data).where(eq(m.id, id)).returning({ id: m.id, read: m.read, starred: m.starred, archived: m.archived });
  return row ? NextResponse.json({ row }) : notFound();
}

/* actions: resend — re-calls sendMail with the stored fields; a fresh log row is written. */
export async function POST(req: Request, ctx: Ctx) {
  const g = await guard(); if (g instanceof NextResponse) return g;
  const { id } = await ctx.params;
  const [row] = await db.select().from(m).where(eq(m.id, id)).limit(1);
  if (!row) return notFound();
  const b = await readJson<{ action?: string }>(req);
  if (b.action !== "resend") return bad("Unknown action");
  if (row.direction !== "out" || !row.toEmail) return bad("Only outbound messages can be resent.");
  if (row.status === "draft") return bad("Drafts are sent from the composer.");
  const atts = await db.select().from(schema.mailAttachments).where(eq(schema.mailAttachments.messageId, id));
  const split = (s: string | null | undefined) => (s || "").split(",").map((x) => x.trim()).filter(Boolean);
  const bcc = split(parseJson<{ bcc?: string } | null>(row.headers, null)?.bcc);
  const r = await sendMail({
    to: split(row.toEmail), cc: row.cc ? split(row.cc) : undefined, bcc: bcc.length ? bcc : undefined,
    subject: row.subject, text: row.text || "", html: row.html || undefined,
    attachments: atts.map((a) => ({ filename: a.filename, contentType: a.contentType, content: Buffer.from(a.data), inline: a.inline, contentId: a.contentId ?? undefined })),
    templateSlug: row.templateSlug ?? undefined, userId: row.userId ?? undefined, txId: row.txId ?? undefined, threadId: row.threadId ?? row.id, channel: row.channel,
  });
  await audit(g.id, "email.resend", "message", id, undefined, { ok: r.ok, logId: r.logId, error: r.error }, g.email);
  if (!r.ok) return bad(r.error || "Send failed", 502);
  return NextResponse.json({ ok: true, logId: r.logId });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const g = await guard(); if (g instanceof NextResponse) return g;
  const { id } = await ctx.params;
  const [row] = await db.select({ id: m.id, subject: m.subject, fromEmail: m.fromEmail, status: m.status }).from(m).where(eq(m.id, id)).limit(1);
  if (!row) return notFound();
  await db.delete(schema.mailAttachments).where(eq(schema.mailAttachments.messageId, id));
  await db.delete(m).where(eq(m.id, id));
  await audit(g.id, row.status === "draft" ? "email.draft_discard" : "email.delete", "message", id, row, undefined, g.email);
  return NextResponse.json({ ok: true });
}
