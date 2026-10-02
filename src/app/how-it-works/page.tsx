import Link from "next/link";
import { Shell } from "@/components/pages/Shell";
import { BILLBOARD_SLOTS, formatMoney, PRICE_PER_FLOOR_CENTS, SITE_NAME, TAKEOVER_MULTIPLIER, TIERS, SELLER_PREMIUM_SHARE } from "@/lib/config";

export const metadata = { title: "How it works" };

export default function HowItWorks() {
  return (
    <Shell>
      <article className="prose-invert max-w-3xl space-y-8">
        <header>
          <h1 className="text-4xl font-bold">How {SITE_NAME} works</h1>
          <p className="mt-2 text-lg text-slate-300">One avenue. Every building is a real business, project or creator. Your building is a permanent address that sends people to your site, and you can see exactly how many.</p>
        </header>
        <Section title="1. Claim a plot">
          <p>Pick an empty plot on the avenue and design your building: height, shape, windows, color, logo, link. Price is simple: <b>{formatMoney(PRICE_PER_FLOOR_CENTS)} per floor</b>. A 1-floor shop is $5. A 100-floor tower is $500. Premium zones (the first block, corners) have minimum heights.</p>
          <p>Your height is your value, and value is the leaderboard. Taller buildings sit higher in rankings and get more impressions from people exploring the city.</p>
        </Section>
        <Section title="2. Nobody loses money on a takeover">
          <p>Any building can be bought by anyone for <b>{TAKEOVER_MULTIPLIER}× its value</b>. When that happens the previous owner gets their full value back plus <b>{Math.round(SELLER_PREMIUM_SHARE * 100)}% of the premium</b> as credit, instantly, with an email. The rest is the platform fee.</p>
          <p>Example: your $100 building is taken for $125. You receive ${100 + 25 * SELLER_PREMIUM_SHARE}. The buyer's building is now worth $125, so the next takeover costs $156.25. Credit can be spent on any claim, takeover, boost or billboard.</p>
          <p>Don't want to be bought? <b>Boost</b> your building: every dollar you add raises both the price and your payout. Landmark buildings get a 7-day shield and a notice before takeovers.</p>
        </Section>
        <Section title="3. Real metrics, not vibes">
          <ul className="list-disc space-y-1 pl-5">
            <li><b>Impressions</b>: how many times your building was on someone's screen.</li>
            <li><b>Unique visitors, views and clicks</b> with a daily chart and period-over-period change.</li>
            <li><b>CTR</b> and <b>referrers</b>: skyline, rankings, directory, your embed badge, X.</li>
            <li><b>Conversions</b>: drop a one-line pixel on your thank-you page and see sales or signups next to clicks.</li>
            <li>Outbound links carry UTM tags so your own analytics agree with ours.</li>
          </ul>
        </Section>
        <Section title="4. Plans">
          <div className="grid gap-3 md:grid-cols-3">
            {Object.entries(TIERS).map(([k, t]) => (
              <div key={k} className="rounded-2xl border border-white/10 p-4">
                <div className="flex items-baseline justify-between"><span className="font-bold">{t.name}</span><span className="mono text-amber-300">{t.priceCents ? `${formatMoney(t.priceCents)}/mo` : "included"}</span></div>
                <ul className="mt-2 space-y-1 text-sm text-slate-300">{t.perks.map((p) => <li key={p}>· {p}</li>)}</ul>
              </div>
            ))}
          </div>
        </Section>
        <Section title="5. Billboards">
          <p>Self-serve advertising inside the city. <b>{BILLBOARD_SLOTS.block.name}</b> from {formatMoney(BILLBOARD_SLOTS.block.priceCentsPerWeek)}/week, <b>{BILLBOARD_SLOTS.airship.name}</b> {formatMoney(BILLBOARD_SLOTS.airship.priceCentsPerWeek)}/week. You see times seen, opens and clicks live.</p>
        </Section>
        <Section title="6. Coins, the arcade and the coaster">
          <p>Coins are a free currency for showing up: +5 a day, more for streaks, +1 for each building you explore, +50 for claiming. Spend them in the arcade machines or on the Skyline Coaster. Win prizes. <b>100 coins = $1 of height</b> on your building, so playing literally grows your tower.</p>
        </Section>
        <Section title="7. Refunds and rules">
          <ul className="list-disc space-y-1 pl-5">
            <li>Full refund within 24 hours of a claim if your building has had no clicks or takeovers.</li>
            <li>Edit name, logo, link, colors and description any time, free.</li>
            <li>No hate, scams, adult content or impersonation. We remove buildings that break this and refund the current value as credit.</li>
            <li>Only building owners can post links in chat. Rate limits apply to everyone.</li>
          </ul>
        </Section>
        <div className="flex gap-3"><Link href="/?claim=1" className="btn-primary">Claim a plot →</Link><Link href="/" className="btn-ghost">Explore the city</Link></div>
      </article>
    </Shell>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3 text-slate-200">
      <h2 className="text-2xl font-bold">{title}</h2>
      {children}
    </section>
  );
}
