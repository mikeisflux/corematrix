import { NextResponse } from "next/server";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/lib/db";
import { getSettings, flag } from "@/lib/settings";
import { divinitycoin } from "@/lib/divinitycoin";
import { currentMrrCents } from "@/lib/subscriptions";
import { siteSeries } from "@/lib/analytics";
import { guard } from "../_lib";
export const dynamic = "force-dynamic";
export async function GET() {
  const g = await guard(); if (g instanceof NextResponse) return g;
  await ensureMigrated();
  const t = schema.transactions;
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const rev = async (since?: number) => { const [r] = await db.select({ sum: sql<number>`coalesce(sum(amount_cents),0)`, n: sql<number>`count(*)` }).from(t).where(and(eq(t.status, "paid"), sql`${t.amountCents} > 0`, since ? gte(t.paidAt, since) : undefined)); return { sum: Number(r.sum), n: Number(r.n) }; };
  const now = Date.now();
  const [today, week, month, lifetime, [pending], [plots], [users], [unread], [failedEmails], [whFail], recentTx, recentInbox, s, dc, mrr, series, [disputes]] = await Promise.all([
    rev(dayStart.getTime()), rev(now - 7 * 86400_000), rev(now - 30 * 86400_000), rev(),
    db.select({ n: sql<number>`count(*)` }).from(t).where(eq(t.status, "pending")),
    db.select({ n: sql<number>`count(*)`, v: sql<number>`coalesce(sum(value_cents),0)` }).from(schema.plots).where(sql`owner_id IS NOT NULL`),
    db.select({ n: sql<number>`count(*)` }).from(schema.users),
    db.select({ n: sql<number>`count(*)` }).from(schema.mailMessages).where(and(eq(schema.mailMessages.direction, "in"), eq(schema.mailMessages.read, false), eq(schema.mailMessages.archived, false))),
    db.select({ n: sql<number>`count(*)` }).from(schema.mailMessages).where(and(eq(schema.mailMessages.direction, "out"), sql`status IN ('failed','bounced')`)),
    db.select({ n: sql<number>`count(*)` }).from(schema.webhookEvents).where(eq(schema.webhookEvents.status, "failed")),
    db.select().from(t).orderBy(desc(t.createdAt)).limit(8),
    db.select({ id: schema.mailMessages.id, fromEmail: schema.mailMessages.fromEmail, fromName: schema.mailMessages.fromName, subject: schema.mailMessages.subject, read: schema.mailMessages.read, createdAt: schema.mailMessages.createdAt, channel: schema.mailMessages.channel }).from(schema.mailMessages).where(and(eq(schema.mailMessages.direction, "in"), eq(schema.mailMessages.archived, false))).orderBy(desc(schema.mailMessages.createdAt)).limit(6),
    getSettings(["SENDGRID_API_KEY", "DIVINITYCOIN_API_KEY", "DIVINITYCOIN_WEBHOOK_SECRET", "SITE_URL", "MAIL_FROM", "INBOUND_EMAIL_KEY", "SENDGRID_EVENT_KEY", "DIVINITYCOIN_TEST_MODE", "CRON_SECRET"]),
    divinitycoin.healthCheck(), currentMrrCents(), siteSeries(14),
    db.select({ n: sql<number>`count(*)` }).from(t).where(eq(t.status, "disputed")),
  ]);
  const tierCounts = await db.select({ tier: schema.plots.tier, n: sql<number>`count(*)` }).from(schema.plots).where(and(sql`tier != 'free'`, eq(schema.plots.subscriptionStatus, "active"))).groupBy(schema.plots.tier);
  const testMode = flag(s.DIVINITYCOIN_TEST_MODE);
  return NextResponse.json({
    revenue: { today: today.sum, week: week.sum, month: month.sum, lifetime: lifetime.sum, txToday: today.n, txLifetime: lifetime.n },
    pending: Number(pending.n), disputes: Number(disputes.n), booths: Number(plots.n), boothValue: Number(plots.v), users: Number(users.n), unread: Number(unread.n), failedEmails: Number(failedEmails.n), webhookFailures: Number(whFail.n),
    mrr, plans: Object.fromEntries(tierCounts.map((r) => [r.tier, Number(r.n)])),
    divinity: dc, testMode,
    visits7d: series.slice(-7).reduce((a, r) => a + r.visits, 0), clicks7d: series.slice(-7).reduce((a, r) => a + r.outboundClicks, 0), signups7d: series.slice(-7).reduce((a, r) => a + r.signups, 0),
    checks: [
      { label: "DivinityCoin API key", ok: !!s.DIVINITYCOIN_API_KEY || testMode, hint: testMode ? "test mode on" : "Settings → DivinityCoin" },
      { label: "DivinityCoin webhook secret", ok: !!s.DIVINITYCOIN_WEBHOOK_SECRET, hint: "DIVINITYCOIN_WEBHOOK_SECRET" },
      { label: "DivinityCoin test mode OFF", ok: !testMode, hint: "turn off before launch" },
      { label: "SendGrid API key", ok: !!s.SENDGRID_API_KEY, hint: "Settings → SendGrid" },
      { label: "Outgoing from address", ok: !!s.MAIL_FROM, hint: "MAIL_FROM" },
      { label: "Inbound Parse key", ok: !!s.INBOUND_EMAIL_KEY, hint: "INBOUND_EMAIL_KEY" },
      { label: "SendGrid event key", ok: !!s.SENDGRID_EVENT_KEY, hint: "SENDGRID_EVENT_KEY" },
      { label: "Public site URL", ok: !!s.SITE_URL, hint: "SITE_URL" },
      { label: "Cron secret", ok: !!s.CRON_SECRET, hint: "CRON_SECRET (renewals + digests)" },
    ],
    recentTx, recentInbox,
  });
}
