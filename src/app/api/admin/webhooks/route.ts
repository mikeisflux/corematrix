import { NextResponse } from "next/server";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/lib/db";
import { divinityWebhookUrl } from "@/lib/divinitycoin";
import { siteUrl } from "@/lib/settings";
import { guard, pageParams, paged, like } from "../_lib";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const g = await guard(); if (g instanceof NextResponse) return g;
  await ensureMigrated();
  const url = new URL(req.url);
  const provider = url.searchParams.get("provider") || "";
  const status = url.searchParams.get("status") || "";
  const q = (url.searchParams.get("q") || "").trim();
  const w = schema.webhookEvents;
  const where = and(provider ? eq(w.provider, provider) : undefined, status ? eq(w.status, status) : undefined, q ? or(sql`${w.eventId} LIKE ${like(q)}`, sql`${w.type} LIKE ${like(q)}`, sql`${w.error} LIKE ${like(q)}`) : undefined);
  const { page, size, skip, take } = pageParams(url);
  const [[{ total }], rows, base] = await Promise.all([
    db.select({ total: sql<number>`count(*)` }).from(w).where(where),
    db.select().from(w).where(where).orderBy(desc(w.receivedAt)).limit(take).offset(skip),
    siteUrl(),
  ]);
  return NextResponse.json({ ...paged(rows.map((r) => ({ ...r, payload: JSON.parse(r.payload) })), Number(total), page, size), urls: { divinitycoin: await divinityWebhookUrl(), sendgridEvents: `${base}/api/webhooks/sendgrid/events?key=<SENDGRID_EVENT_KEY>`, sendgridInbound: `${base}/api/webhooks/sendgrid/inbound?key=<INBOUND_EMAIL_KEY>` } });
}
