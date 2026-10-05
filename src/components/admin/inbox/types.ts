/* Shared types and pure helpers for the admin mail client. */
export interface MsgRow {
  id: string; direction: string; channel: string; fromEmail: string; fromName: string | null; toEmail: string | null; cc?: string | null;
  subject: string; snippet?: string; read: boolean; starred: boolean; archived: boolean; threadId: string | null; status: string | null; statusMessage: string | null;
  templateSlug: string | null; createdAt: number; sentAt: number | null; attachmentCount: number;
}
export interface AttachmentRow { id: string; filename: string; contentType: string; size: number; inline: boolean; contentId?: string | null }
export interface FullMsg extends MsgRow {
  cc: string | null; text: string | null; html: string | null; headers: Record<string, string> | null; attachments: AttachmentRow[];
  events: Array<{ event: string; at?: string; timestamp?: number | string; reason?: string; url?: string }> | null; userId: string | null; txId: string | null; plotId: number | null;
}
export interface ThreadRow { id: string; direction: string; fromEmail: string; fromName: string | null; toEmail: string | null; subject: string; snippet: string; createdAt: number; status: string | null; read: boolean; attachmentCount: number }
export type Counts = Record<string, number>;
export interface ListData { rows: MsgRow[]; total: number; page: number; pages: number; counts: Counts }

export type FolderId = "inbox" | "starred" | "sent" | "drafts" | "archived" | "failed" | "all";
export const FOLDERS: { id: FolderId; label: string; countKind?: "hot" | "bad" | "dim" }[] = [
  { id: "inbox", label: "Inbox", countKind: "hot" }, { id: "starred", label: "Starred", countKind: "dim" }, { id: "sent", label: "Sent", countKind: "dim" },
  { id: "drafts", label: "Drafts", countKind: "dim" }, { id: "archived", label: "Archived", countKind: "dim" }, { id: "failed", label: "Failed", countKind: "bad" }, { id: "all", label: "All", countKind: "dim" },
];
export type BulkAction = "read" | "unread" | "star" | "unstar" | "archive" | "unarchive" | "delete";
export interface ComposePrefill { draftId?: string | null; to?: string; cc?: string; bcc?: string; subject?: string; html?: string; threadId?: string; quote?: string; copyAttachmentsFrom?: string }

export const FAILED = ["failed", "bounced", "spam"];
export const isFailed = (s: string | null | undefined) => FAILED.includes(s || "");
export const isDraft = (m: { status: string | null }) => m.status === "draft";
export const kb = (n: number) => n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

export function relTime(ts: number | string, now = Date.now()): string {
  const d = new Date(ts); const ms = now - d.getTime();
  if (ms < 60_000) return "now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
  if (ms < 86_400_000 && new Date(now).getDate() === d.getDate()) return `${Math.floor(ms / 3_600_000)}h`;
  const y = new Date(now); y.setDate(y.getDate() - 1);
  if (y.toDateString() === d.toDateString()) return "Yesterday";
  if (d.getFullYear() === new Date(now).getFullYear()) return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

const EMAIL = /^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/;
export function parseEmails(s: string): string[] {
  return s.split(/[,;\n]+/).map((e) => { const m = e.match(/<([^>]+)>/); return (m ? m[1] : e).trim(); }).filter(Boolean);
}
export const invalidEmails = (s: string) => parseEmails(s).filter((e) => !EMAIL.test(e));
export const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c] as string));
export const stripHtml = (html: string) => html.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|h\d|li|tr)>/gi, "\n").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/\n{3,}/g, "\n\n").trim();

const who = (m: { fromName: string | null; fromEmail: string }) => m.fromName ? `${m.fromName} <${m.fromEmail}>` : m.fromEmail;
const bodyText = (m: FullMsg) => (m.text || (m.html ? stripHtml(m.html) : "")).slice(0, 6000);
const quoteBlock = (inner: string) => `<p><br></p><p><br></p><blockquote style="border-left:3px solid #ccc;margin:8px 0;padding:4px 12px;color:#555">${inner}</blockquote>`;
const re = (s: string) => /^re:/i.test(s) ? s : `Re: ${s}`;
const fwd = (s: string) => /^fwd?:/i.test(s) ? s : `Fwd: ${s}`;
const not = (list: string[], me: string) => list.filter((e) => e && e.toLowerCase() !== me.toLowerCase());

export function replyPrefill(m: FullMsg, all: boolean, me: string): ComposePrefill {
  const inbound = m.direction === "in";
  const to = inbound ? [m.fromEmail] : parseEmails(m.toEmail || "");
  const others = all ? not([...parseEmails(m.toEmail || ""), ...parseEmails(m.cc || "")], me).filter((e) => !to.includes(e)) : [];
  const html = quoteBlock(`On ${new Date(m.createdAt).toLocaleString()}, ${esc(who(m))} wrote:<br><br>${esc(bodyText(m)).replace(/\n/g, "<br>")}`);
  return { to: to.join(", "), cc: all ? others.join(", ") : "", subject: re(m.subject), threadId: m.threadId || m.id, html };
}
export function forwardPrefill(m: FullMsg): ComposePrefill {
  const head = [`From: ${who(m)}`, `Date: ${new Date(m.createdAt).toLocaleString()}`, `Subject: ${m.subject}`, `To: ${m.toEmail || ""}`, m.cc ? `Cc: ${m.cc}` : ""].filter(Boolean).join("\n");
  const html = quoteBlock(`---------- Forwarded message ----------<br>${esc(head).replace(/\n/g, "<br>")}<br><br>${esc(bodyText(m)).replace(/\n/g, "<br>")}`);
  return { to: "", subject: fwd(m.subject), html, copyAttachmentsFrom: m.attachments.some((a) => !a.inline) ? m.id : undefined };
}
export const quoteToHtml = (q: string) => (q.trim() ? quoteBlock(esc(q.trim()).replace(/\n/g, "<br>")) : "");
