/* Transactional + digest emails. All go through SendGrid templates
   (src/lib/email-templates.ts defaults, editable in /admin/emails/templates). */
import { eq, sql } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/lib/db";
import { sendTemplate } from "@/lib/sendgrid";
import { formatMoney, splitTakeover } from "@/lib/config";
import { plotSeries, sumSeries, plotReferrerRows } from "@/lib/analytics";
import { lastWeekRank } from "@/lib/seasons";
import { daysAgoKey } from "@/lib/util";

async function recipient(userId: string | null): Promise<{ email: string; name: string } | null> {
  if (!userId) return null;
  const [u] = await db.select({ email: schema.users.email, name: schema.users.displayName, notify: schema.users.notifyEmail }).from(schema.users).where(eq(schema.users.id, userId));
  return u?.notify ? { email: u.email, name: u.name ?? u.email } : null;
}

export async function sendWelcome(ownerId: string, plotId: number, name: string) {
  const u = await recipient(ownerId);
  if (!u) return;
  await sendTemplate("welcome", u.email, { subject: `${name} is live (#${plotId})`, fallbackText: `Your booth ${name} (#${plotId}) is live. Open your dashboard to share your card, add the badge and the conversion pixel.`, name: u.name, plotName: name, plotId }, { userId: ownerId, plotId, channel: "system" });
}

export async function sendReceipt(userId: string, description: string, amountCents: number, txId: string, plotId?: number) {
  const u = await recipient(userId);
  if (!u || amountCents <= 0) return;
  await sendTemplate("receipt", u.email, { subject: `Receipt: ${description}`, fallbackText: `Paid ${formatMoney(amountCents)} for ${description}. Reference ${txId}.`, name: u.name, description, amount: formatMoney(amountCents), txId, plotId: plotId ?? "" }, { userId, txId, plotId, channel: "system" });
}

export async function sendSold(sellerId: string, plotId: number, name: string, priceCents: number, payoutCents: number, valueBefore: number) {
  const u = await recipient(sellerId);
  if (!u) return;
  await sendTemplate("sold", u.email, {
    subject: `${name} was bought out for ${formatMoney(priceCents)}. You earned ${formatMoney(payoutCents - valueBefore)}.`,
    fallbackText: `Someone paid ${formatMoney(priceCents)} for #${plotId}. ${formatMoney(payoutCents)} was added to your balance (${formatMoney(payoutCents - valueBefore)} profit).`,
    name: u.name, plotName: name, plotId, price: formatMoney(priceCents), payout: formatMoney(payoutCents), profit: formatMoney(payoutCents - valueBefore),
  }, { userId: sellerId, plotId, channel: "system" });
}

export async function sendTakeoverNudge(ownerId: string, plotId: number, name: string, valueCents: number) {
  const u = await recipient(ownerId);
  if (!u) return;
  const { price, sellerPayout } = splitTakeover(valueCents);
  await sendTemplate("takeover_nudge", u.email, { subject: `Someone is looking at taking over ${name}`, fallbackText: `A visitor opened the takeover page for #${plotId}. Price ${formatMoney(price)}; you'd receive ${formatMoney(sellerPayout)}. Boost to raise both.`, name: u.name, plotName: name, plotId, price: formatMoney(price), payout: formatMoney(sellerPayout) }, { userId: ownerId, plotId, channel: "system" });
}

export async function sendSeasonResult(ownerId: string, plotId: number, name: string, rank: number, views: number, clicks: number, season: string, prize: number) {
  const u = await recipient(ownerId);
  if (!u) return;
  await sendTemplate("season_result", u.email, { subject: `${name} finished #${rank} this week`, fallbackText: `${name} was #${rank} trending in season ${season}: ${views} views, ${clicks} clicks. You won ${prize} coins and a week on the home page.`, name: u.name, plotName: name, plotId, rank, views: views.toLocaleString(), clicks: clicks.toLocaleString(), season, prize }, { userId: ownerId, plotId, channel: "system" });
}

/** Monday report for every owner with email on. Pro+ gets referrers. */
export async function sendWeeklyDigests(): Promise<number> {
  await ensureMigrated();
  const owners = await db.select({ id: schema.users.id, email: schema.users.email, name: schema.users.displayName }).from(schema.users).where(eq(schema.users.notifyEmail, true));
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
      const conv = series.slice(-7).reduce((a, r) => a + r.conversions, 0);
      sections.push(`<h3 style="margin:18px 0 6px;color:#fff;font-size:16px">${p.name} · #${p.id} · rank #${rank}${move ? ` (${move})` : ""}</h3>
<table cellpadding="6" style="border-collapse:collapse;color:#c9cfe6;font-size:14px">
<tr><td>Impressions</td><td><b>${cur.impressions.toLocaleString()}</b></td><td>${d(cur.impressions, prev.impressions)}</td></tr>
<tr><td>Unique visitors</td><td><b>${cur.uniques.toLocaleString()}</b></td><td>${d(cur.uniques, prev.uniques)}</td></tr>
<tr><td>Booth views</td><td><b>${cur.views.toLocaleString()}</b></td><td>${d(cur.views, prev.views)}</td></tr>
<tr><td>Website clicks</td><td><b>${cur.clicks.toLocaleString()}</b></td><td>${d(cur.clicks, prev.clicks)}</td></tr>
<tr><td>CTR</td><td><b>${cur.views ? ((cur.clicks / cur.views) * 100).toFixed(1) : "0.0"}%</b></td><td></td></tr>
${conv ? `<tr><td>Conversions</td><td><b>${conv}</b></td><td>${formatMoney(series.slice(-7).reduce((a, r) => a + r.conversionValueCents, 0))}</td></tr>` : ""}
</table>
${refs.length ? `<p style="color:#c9cfe6"><b>Where clicks came from:</b> ${refs.slice(0, 5).map((r) => `${r.source} ${r.clicks}`).join(" · ")}</p>` : p.tier === "free" ? `<p style="color:#7a82a6">Referrers and 90-day history are on the Pro plan.</p>` : ""}
<p style="color:#c9cfe6">Takeover price now ${formatMoney(splitTakeover(p.valueCents).price)}.</p>`);
    }
    const r = await sendTemplate("weekly_digest", o.email, { subject: `Your week: ${mine.length === 1 ? mine[0].name : `${mine.length} booths`}`, fallbackText: "Your weekly report is ready in the dashboard.", name: o.name ?? o.email, sectionsHtml: sections.join("<hr style=\"border:0;border-top:1px solid #1f2746\">") }, { userId: o.id, channel: "system" });
    if (r.ok) sent++;
  }
  return sent;
}

/** Prune the uniques dedupe table; it only needs today and yesterday. */
export async function pruneVisitorSeen() {
  await db.delete(schema.visitorSeen).where(sql`${schema.visitorSeen.day} < ${daysAgoKey(2)}`);
}
