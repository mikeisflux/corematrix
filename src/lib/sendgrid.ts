/* Outgoing email via the SendGrid v3 API, with attachments, templates and a
   delivery log (mail_messages rows, direction "out"). Ported from the Play
   Time admin onto Drizzle. Without an API key the message is still logged
   (status "failed") and printed to the server console so dev sign-in links
   keep working. */
import { ensureDefaultTemplates } from "@/lib/template-seed";
import { eq } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/lib/db";
import { flag, getSetting, getSettings } from "./settings";
import { newId, now } from "./util";

export interface MailAttachment { filename: string; contentType: string; content: Buffer; inline?: boolean; contentId?: string }

export interface MailInput {
  to: string | string[]; cc?: string[]; bcc?: string[]; subject: string; text: string; html?: string; replyTo?: string;
  attachments?: MailAttachment[]; templateSlug?: string; userId?: string; txId?: string; boothId?: number; threadId?: string; channel?: string;
}
export interface MailResult { ok: boolean; error?: string; messageId?: string; logId?: string }

export async function sendMail(input: MailInput): Promise<MailResult> {
  await ensureMigrated();
  const s = await getSettings(["SENDGRID_API_KEY", "MAIL_FROM", "MAIL_FROM_NAME", "MAIL_REPLY_TO", "MAIL_BCC_ADMIN", "MAIL_FOOTER", "SENDGRID_TRACKING", "SITE_NAME"]);
  const from = s.MAIL_FROM || "no-reply@forevercomiccon.com";
  const fromName = s.MAIL_FROM_NAME || s.SITE_NAME || "ForeverComicCon";
  const toList = (Array.isArray(input.to) ? input.to : [input.to]).filter(Boolean);
  const text = s.MAIL_FOOTER ? `${input.text}\n\n—\n${s.MAIL_FOOTER}` : input.text;
  const html = input.html
    ? (s.MAIL_FOOTER ? input.html.replace(/<\/body>/i, `<p style="color:#8b8693;font:12px sans-serif">${escapeHtml(s.MAIL_FOOTER)}</p></body>`) : input.html)
    : undefined;

  const logId = newId();
  await db.insert(schema.mailMessages).values({
    id: logId, direction: "out", channel: input.channel || "email", fromEmail: from, fromName, toEmail: toList.join(", "), cc: input.cc?.join(", ") || null,
    subject: input.subject, text, html: html ?? null, read: true, status: "queued", templateSlug: input.templateSlug ?? null,
    userId: input.userId ?? null, txId: input.txId ?? null, boothId: input.boothId ?? null, threadId: input.threadId ?? null,
    headers: input.bcc?.length ? JSON.stringify({ bcc: input.bcc.join(", ") }) : null, createdAt: now(),
  });
  if (input.attachments?.length) {
    await db.insert(schema.mailAttachments).values(input.attachments.map((a) => ({ id: newId(), messageId: logId, filename: a.filename, contentType: a.contentType, size: a.content.length, data: a.content, inline: !!a.inline, contentId: a.contentId ?? null })));
  }

  if (!s.SENDGRID_API_KEY) {
    console.log(`\n[mail → ${toList.join(", ")}] ${input.subject}\n${text}\n`);
    await db.update(schema.mailMessages).set({ status: "failed", statusMessage: "SENDGRID_API_KEY is not configured (Admin → Settings → SendGrid). Logged to the console instead." }).where(eq(schema.mailMessages.id, logId));
    return { ok: false, error: "SENDGRID_API_KEY is not configured (Admin → Settings → SendGrid).", logId };
  }

  const bcc = [...(input.bcc ?? []), ...(s.MAIL_BCC_ADMIN && input.txId ? [s.MAIL_BCC_ADMIN] : [])].filter((e) => !toList.includes(e));
  const body = {
    personalizations: [{
      to: toList.map((email) => ({ email })),
      ...(input.cc?.length ? { cc: input.cc.map((email) => ({ email })) } : {}),
      ...(bcc.length ? { bcc: bcc.map((email) => ({ email })) } : {}),
      custom_args: { fcc_log_id: logId },
    }],
    from: { email: from, name: fromName },
    ...((input.replyTo || s.MAIL_REPLY_TO) ? { reply_to: { email: input.replyTo || s.MAIL_REPLY_TO } } : {}),
    subject: input.subject,
    content: [{ type: "text/plain", value: text }, ...(html ? [{ type: "text/html", value: html }] : [])],
    ...(input.attachments?.length ? {
      attachments: input.attachments.map((a) => ({ content: a.content.toString("base64"), type: a.contentType, filename: a.filename, disposition: a.inline ? "inline" : "attachment", ...(a.contentId ? { content_id: a.contentId } : {}) })),
    } : {}),
    tracking_settings: { click_tracking: { enable: flag(s.SENDGRID_TRACKING, true) }, open_tracking: { enable: flag(s.SENDGRID_TRACKING, true) } },
  };

  try {
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST", headers: { Authorization: `Bearer ${s.SENDGRID_API_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if (res.status === 202) {
      const messageId = res.headers.get("x-message-id") || undefined;
      await db.update(schema.mailMessages).set({ status: "sent", sentAt: now(), sendgridMessageId: messageId ?? null }).where(eq(schema.mailMessages.id, logId));
      return { ok: true, messageId, logId };
    }
    const error = `SendGrid ${res.status}: ${(await res.text()).slice(0, 300)}`;
    await db.update(schema.mailMessages).set({ status: "failed", statusMessage: error }).where(eq(schema.mailMessages.id, logId));
    return { ok: false, error, logId };
  } catch (err) {
    const error = String(err);
    await db.update(schema.mailMessages).set({ status: "failed", statusMessage: error }).where(eq(schema.mailMessages.id, logId));
    return { ok: false, error, logId };
  }
}

/* ───────── Templates ───────── */

/* {{var}} substitution; {{#if var}}…{{else}}…{{/if}}; {{#each items}}…{{/each}} with {{this.key}}; {{{raw}}}. */
export function renderTemplate(src: string, vars: Record<string, unknown>): string {
  let out = src.replace(/\{\{#each\s+([\w.]+)\}\}([\s\S]*?)\{\{\/each\}\}/g, (_m, key, inner) => {
    const arr = getPath(vars, key);
    if (!Array.isArray(arr)) return "";
    return arr.map((item) => renderTemplate(inner, { ...vars, this: item })).join("");
  });
  out = out.replace(/\{\{#if\s+([\w.]+)\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g, (_m, key, a, b) => (getPath(vars, key) ? a : (b ?? "")));
  out = out.replace(/\{\{\{\s*([\w.]+)\s*\}\}\}/g, (_m, key) => String(getPath(vars, key) ?? ""));
  out = out.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key) => escapeHtml(String(getPath(vars, key) ?? "")));
  return out;
}

function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), obj);
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

export function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|h\d|li|tr)>/gi, "\n").replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n").trim();
}

/* Send a stored template by slug. Falls back to a plain message when the
   template is missing or inactive so transactional mail never silently drops. */
export async function sendTemplate(slug: string, to: string, vars: Record<string, unknown>, extra: Partial<MailInput> = {}): Promise<MailResult> {
  await ensureMigrated();
  await ensureDefaultTemplates();
  const [t] = await db.select().from(schema.emailTemplates).where(eq(schema.emailTemplates.slug, slug)).limit(1);
  const base = {
    siteName: (await getSetting("SITE_NAME")) || process.env.NEXT_PUBLIC_SITE_NAME || "ForeverComicCon",
    siteUrl: ((await getSetting("SITE_URL")) || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, ""),
    supportEmail: (await getSetting("SUPPORT_EMAIL")) || "hello@forevercomiccon.com",
    currentYear: new Date().getFullYear(),
  };
  const all = { ...base, ...vars };
  if (!t || !t.isActive) {
    const subject = String(vars.subject ?? slug.replace(/_/g, " "));
    const text = String(vars.fallbackText ?? subject);
    const html = vars.fallbackHtml ? String(vars.fallbackHtml) : undefined;
    return sendMail({ to, subject, text, html, templateSlug: slug, ...extra });
  }
  const subject = renderTemplate(t.subject, all);
  const html = renderTemplate(t.html, all);
  const text = t.text ? renderTemplate(t.text, all) : htmlToText(html);
  return sendMail({ to, subject, text, html, templateSlug: slug, ...extra });
}
