/** Transactional + digest emails. All go through sendMail (Resend or console). */
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/lib/db";
import { sendMail } from "@/lib/mailer";
import { formatMoney, SITE_NAME, SITE_URL, splitTakeover } from "@/lib/config";
import { plotSeries, sumSeries, plotReferrerRows } from "@/lib/analytics";
import { lastWeekRank } from "@/lib/seasons";
import { dayKey, daysAgoKey } from "@/lib/util";

async function emailOf(userId: string | null): Promise<{ email: string; name: string | null } | null> {
  if (!userId) return null;
  const [u] = await db.select({ email: schema.users.email, name: schema.users.displayName, notify: schema.users.notifyEmail }).from(schema.users).where(eq(schema.users.id, userId));
  return u?.notify ? { email: u.email, name: u.name } : null;
}

export async function sendWelcome(ownerId: string, plotId: number, name: string) {
  const u = await emailOf(ownerId);
  if (!u) return;
  await sendMail(
    u.email,
    `${name} is live on ${SITE_NAME} (Plot #${plotId})`,
    `<p>Your building is on the skyline. Three things that make the difference:</p>
<ol>
<li><b>Share your card on X</b>: <a href="${SITE_URL}/plot/${plotId}">${SITE_URL}/plot/${plotId}</a> renders a skyline card when posted.</li>
<li><b>Put the badge on your site</b>: visitors click through, and that raises your trending rank. Code is in your dashboard.</li>
<li><b>Add the conversion pixel</b> to your thank-you page so you can see sales and signups next to clicks.</li>
</ol>
<p>You'll get an email the moment anyone takes over your building (with your payout), and a weekly report every Monday.</p>
<p><a href="${SITE_URL}/dashboard?plot=${plotId}">Open your dashboard</a></p>`,
  );
}

export async function sendSold(sellerId: string, plotId: number, name: string, priceCents: number, payoutCents: number, valueBefore: number) {
  const u = await emailOf(sellerId);
  if (!u) return;
  await sendMail(
    u.email,
    `${name} was bought out for ${formatMoney(priceCents)}. You earned ${formatMoney(payoutCents - valueBefore)}.`,
    `<p>Someone paid <b>${formatMoney(priceCents)}</b> for Plot #${plotId}.</p>
<p><b>${formatMoney(payoutCents)}</b> has been added to your balance: your ${formatMoney(valueBefore)} back plus <b>${formatMoney(payoutCents - valueBefore)} profit</b>.</p>
<p>Spend it on a new plot, a takeover of your own, or a boost. <a href="${SITE_URL}/?claim=1">Claim a plot</a> · <a href="${SITE_URL}/rankings">See who to take over</a></p>`,
  );
}

export async function sendTakeoverNudge(ownerId: string, plotId: number, name: string, valueCents: number) {
  const u = await emailOf(ownerId);
  if (!u) return;
  const { price, sellerPayout } = splitTakeover(valueCents);
  await sendMail(
    u.email,
    `Someone is looking at taking over ${name}`,
    `<p>A visitor just opened the takeover page for Plot #${plotId}. The current price is <b>${formatMoney(price)}</b>; if they buy, you receive ${formatMoney(sellerPayout)}.</p>
<p>Want to make it harder? <a href="${SITE_URL}/dashboard?plot=${plotId}">Boost your building</a>: every dollar raises the price and your payout.</p>`,
  );
}

/** Monday report for every owner with email on. Pro+ gets referrers. */
export async function sendWeeklyDigests(): Promise<number> {
  await ensureMigrated();
  const owners = await db.select({ id: schema.users.id, email: schema.users.email, notify: schema.users.notifyEmail }).from(schema.users).where(eq(schema.users.notifyEmail, true));
  const allPlots = await db.select().from(schema.plots).where(sql`owner_id IS NOT NULL`);
  const ranks = new Map(allPlots.slice().sort((a, b) => b.valueCents - a.valueCents).map((p, i) => [p.id, i + 1]));
  let sent = 0;
  for (const o of owners) {
    const mine = allPlots.filter((p) => p.ownerId === o.id);
    if (!mine.length) continue;
    const sections: string[] = [];
    for (const p of mine) {
      const series = await plotSeries(p.id, 14);
      const cur = sumSeries(series.slice(-7));
      const prev = sumSeries(series.slice(0, 7));
      const d = (a: number, b: number) => (b ? `${a >= b ? "+" : ""}${Math.round(((a - b) / b) * 100)}%` : a ? "new" : "–");
      const rank = ranks.get(p.id) ?? 0;
      const last = await lastWeekRank(p.id);
      const move = last ? (last > rank ? `up ${last - rank} from #${last}` : last < rank ? `down ${rank - last} from #${last}` : "unchanged") : "";
      const refs = p.tier !== "free" ? await plotReferrerRows(p.id) : [];
      sections.push(`<h3>${p.name} · Plot #${p.id} · rank #${rank}${move ? ` (${move})` : ""}</h3>
<table cellpadding="6" style="border-collapse:collapse">
<tr><td>Impressions</td><td><b>${cur.impressions.toLocaleString()}</b></td><td>${d(cur.impressions, prev.impressions)}</td></tr>
<tr><td>Unique visitors</td><td><b>${cur.uniques.toLocaleString()}</b></td><td>${d(cur.uniques, prev.uniques)}</td></tr>
<tr><td>Building views</td><td><b>${cur.views.toLocaleString()}</b></td><td>${d(cur.views, prev.views)}</td></tr>
<tr><td>Website clicks</td><td><b>${cur.clicks.toLocaleString()}</b></td><td>${d(cur.clicks, prev.clicks)}</td></tr>
<tr><td>CTR</td><td><b>${cur.views ? ((cur.clicks / cur.views) * 100).toFixed(1) : "0.0"}%</b></td><td></td></tr>
${series.slice(-7).some((r) => r.conversions) ? `<tr><td>Conversions</td><td><b>${series.slice(-7).reduce((a, r) => a + r.conversions, 0)}</b></td><td>${formatMoney(series.slice(-7).reduce((a, r) => a + r.conversionValueCents, 0))}</td></tr>` : ""}
</table>
${refs.length ? `<p><b>Where clicks came from:</b> ${refs.slice(0, 5).map((r) => `${r.source} ${r.clicks}`).join(" · ")}</p>` : p.tier === "free" ? `<p style="color:#666">Referrers and 90-day history are on the Pro plan.</p>` : ""}
<p><a href="${SITE_URL}/dashboard?plot=${p.id}">Dashboard</a> · takeover price now ${formatMoney(splitTakeover(p.valueCents).price)}</p>`);
    }
    await sendMail(o.email, `Your ${SITE_NAME} week: ${mine.length === 1 ? mine[0].name : `${mine.length} buildings`}`, `<p>Here's what your skyline did this week.</p>${sections.join("<hr>")}<p style="color:#666;font-size:12px">Turn these off in your dashboard.</p>`);
    sent++;
  }
  return sent;
}

/** Prune the uniques dedupe table; it only needs today and yesterday. */
export async function pruneVisitorSeen() {
  await db.delete(schema.visitorSeen).where(sql`${schema.visitorSeen.day} < ${daysAgoKey(2)}`);
  void dayKey;
  void and;
  void gte;
  void desc;
}
