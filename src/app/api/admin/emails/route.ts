import { NextResponse } from "next/server";
import { and, desc, eq, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/lib/db";
import { guard, pageParams, paged, like } from "../_lib";

export const dynamic = "force-dynamic";
const m = schema.mailMessages;
const FAILED = ["failed", "bounced", "spam"];
const notDraft = or(isNull(m.status), ne(m.status, "draft"))!;
const FOLDERS: Record<string, SQL> = {
  inbox: and(eq(m.direction, "in"), eq(m.archived, false))!,
  starred: and(eq(m.starred, true), notDraft)!,
  sent: and(eq(m.direction, "out"), eq(m.archived, false), notDraft)!,
  drafts: eq(m.status, "draft"),
  archived: and(eq(m.archived, true), notDraft)!,
  failed: and(eq(m.direction, "out"), eq(m.archived, false), sql`${m.status} IN ('failed','bounced','spam')`)!,
  all: sql`1=1`,
};
const snippet = (t: string | null) => (t || "").replace(/\s+/g, " ").trim().slice(0, 160);

/* GET ?folder=inbox|starred|sent|drafts|archived|failed|all &q= &page= &pageSize= (&status= &channel=) */
export async function GET(req: Request) {
  const g = await guard(); if (g instanceof NextResponse) return g;
  await ensureMigrated();
  const url = new URL(req.url);
  const folder = url.searchParams.get("folder") || "inbox";
  const q = (url.searchParams.get("q") || "").trim().slice(0, 200);
  const status = url.searchParams.get("status") || "";
  const channel = url.searchParams.get("channel") || "";
  const where = and(
    FOLDERS[folder] ?? FOLDERS.inbox,
    status ? eq(m.status, status) : undefined,
    channel ? eq(m.channel, channel) : undefined,
    q ? or(sql`${m.subject} LIKE ${like(q)}`, sql`${m.fromEmail} LIKE ${like(q)}`, sql`${m.toEmail} LIKE ${like(q)}`, sql`${m.fromName} LIKE ${like(q)}`, sql`${m.cc} LIKE ${like(q)}`, sql`${m.text} LIKE ${like(q)}`) : undefined,
  );
  const { page, size, skip, take } = pageParams(url);
  const countWhere: Record<string, SQL> = { ...FOLDERS, inbox: and(FOLDERS.inbox, eq(m.read, false))! };
  const keys = Object.keys(countWhere);
  const [[{ total }], rows, ...countVals] = await Promise.all([
    db.select({ total: sql<number>`count(*)` }).from(m).where(where),
    db.select({
      id: m.id, direction: m.direction, channel: m.channel, fromEmail: m.fromEmail, fromName: m.fromName, toEmail: m.toEmail, cc: m.cc, subject: m.subject, text: m.text, read: m.read, starred: m.starred, archived: m.archived, threadId: m.threadId, status: m.status, statusMessage: m.statusMessage, templateSlug: m.templateSlug, createdAt: m.createdAt, sentAt: m.sentAt,
      attachmentCount: sql<number>`(select count(*) from mail_attachments a where a.message_id = ${m.id})`,
    }).from(m).where(where).orderBy(desc(m.createdAt)).limit(take).offset(skip),
    ...keys.map((k) => db.select({ n: sql<number>`count(*)` }).from(m).where(countWhere[k]).then((r) => Number(r[0]?.n ?? 0))),
  ]);
  void FAILED;
  const counts = Object.fromEntries(keys.map((k, i) => [k, countVals[i]])) as Record<string, number>;
  const list = rows.map(({ text, ...r }) => ({ ...r, attachmentCount: Number(r.attachmentCount), snippet: snippet(text) }));
  return NextResponse.json({ ...paged(list, Number(total), page, size), counts: { ...counts, unread: counts.inbox } });
}
