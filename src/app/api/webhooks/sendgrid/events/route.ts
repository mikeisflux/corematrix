import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { eq, or, sql } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { finishWebhook, recordWebhook } from "@/lib/orders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS: Record<string, string | null> = { delivered: "delivered", open: "opened", click: "clicked", bounce: "bounced", dropped: "bounced", spamreport: "spam", deferred: null, processed: null, unsubscribe: null, group_unsubscribe: null, group_resubscribe: null };
const RANK: Record<string, number> = { queued: 0, sent: 1, delivered: 2, opened: 3, clicked: 4, bounced: 5, spam: 5, failed: 5 };

function keyOk(provided: string | null, expected: string) {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
interface SgEvent { event?: string; sg_event_id?: string; sg_message_id?: string; fcc_log_id?: string; email?: string; timestamp?: number; reason?: string; response?: string; url?: string; status?: string; [k: string]: unknown }

/* SendGrid Event Webhook: delivered / open / click / bounce / dropped / spamreport → message status + timeline. */
export async function POST(req: Request) {
  await ensureMigrated();
  const expected = await getSetting("SENDGRID_EVENT_KEY");
  if (!keyOk(new URL(req.url).searchParams.get("key"), expected)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  let events: SgEvent[];
  try { const body = await req.json(); events = Array.isArray(body) ? body : [body]; } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  let handled = 0, skipped = 0;
  for (const ev of events) {
    if (!ev || typeof ev !== "object" || !ev.event) { skipped++; continue; }
    const eventId = String(ev.sg_event_id || `${ev.sg_message_id || ev.fcc_log_id || "x"}-${ev.event}-${ev.timestamp || Date.now()}`);
    const recId = await recordWebhook("sendgrid", eventId, String(ev.event), ev);
    if (!recId) { skipped++; continue; }
    try {
      const sgId = ev.sg_message_id ? String(ev.sg_message_id).split(".")[0] : null;
      const [msg] = ev.fcc_log_id
        ? await db.select().from(schema.mailMessages).where(eq(schema.mailMessages.id, String(ev.fcc_log_id))).limit(1)
        : sgId ? await db.select().from(schema.mailMessages).where(or(eq(schema.mailMessages.sendgridMessageId, sgId), sql`${schema.mailMessages.sendgridMessageId} LIKE ${sgId + "%"}`)).limit(1) : [];
      if (!msg) { await finishWebhook(recId, "ignored", "no matching message"); skipped++; continue; }
      const prev = msg.events ? (JSON.parse(msg.events) as unknown[]) : [];
      const entry = { event: ev.event, at: ev.timestamp ? new Date(Number(ev.timestamp) * 1000).toISOString() : new Date().toISOString(), email: ev.email, reason: ev.reason, response: ev.response, url: ev.url, status: ev.status };
      const next = STATUS[String(ev.event)] ?? null;
      const cur = msg.status || "sent";
      const status = next && (RANK[next] ?? 0) >= (RANK[cur] ?? 0) ? next : cur;
      const statusMessage = ["bounce", "dropped", "deferred", "spamreport"].includes(String(ev.event)) ? String(ev.reason || ev.response || ev.event).slice(0, 500) : msg.statusMessage;
      await db.update(schema.mailMessages).set({ events: JSON.stringify([...prev, entry].slice(-100)), status, statusMessage, ...(sgId && !msg.sendgridMessageId ? { sendgridMessageId: sgId } : {}) }).where(eq(schema.mailMessages.id, msg.id));
      await finishWebhook(recId, "processed");
      handled++;
    } catch (err) {
      await finishWebhook(recId, "failed", String(err).slice(0, 1000));
    }
  }
  return NextResponse.json({ ok: true, handled, skipped });
}
