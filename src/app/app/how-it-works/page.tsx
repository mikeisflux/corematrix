import Link from "next/link";
import { Shell } from "@/components/pages/Shell";
import { BILLBOARD_SLOTS, BOOTH_SIZES, formatMoney, SITE_NAME, TAKEOVER_MULTIPLIER, TIERS, SELLER_PREMIUM_SHARE, ZONES } from "@/lib/config";

export const metadata = { title: "How it works" };

export default function HowItWorks() {
  return (
    <Shell>
      <article className="prose-invert max-w-3xl space-y-8 text-slate-200">
        <header>
          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-300">How it works</div>
          <h1 className="mt-2 text-4xl font-bold">{SITE_NAME}: the comic convention that never closes.</h1>
          <p className="mt-2 text-lg text-slate-300">One exhibit hall, laid out like a real convention floor, open 24/7. Every booth is a real publisher, artist, shop or fan project. Your booth is a permanent spot that sends people to your site, and you can see exactly who stopped by.</p>
        </header>
        <section className="space-y-2">
          <h2 className="text-2xl font-bold">1. Get a booth</h2>
          <p>Pick an open space on the floor plan and set up your booth: name, banner, logo, link, colors. Prices are per space:</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {Object.entries(BOOTH_SIZES).map(([k, v]) => <li key={k} className="rounded-xl border border-white/10 bg-white/[0.03] p-3"><b>{v.short} · {v.name}</b> <span className="mono text-amber-300">{formatMoney(v.priceCents)}</span><div className="text-sm text-slate-400">{v.blurb}</div></li>)}
          </ul>
          <p>Zones multiply the price: <b>{ZONES.headliner.name}</b> ({ZONES.headliner.mult}×) {ZONES.headliner.blurb} <b>{ZONES.front.name}</b> ({ZONES.front.mult}×) {ZONES.front.blurb}</p>
          <p>What you paid is your booth's value, and value is the leaderboard. Higher-value booths get bigger signage: a header banner, then a hanging sign from the trusses, then a tower. Visitors click your banner and your site opens in a new tab.</p>
        </section>
        <section className="space-y-2">
          <h2 className="text-2xl font-bold">2. Takeovers nobody loses on</h2>
          <p>Any booth can be bought by anyone for <b>{TAKEOVER_MULTIPLIER}× its value</b>. When that happens the previous exhibitor gets their full value back plus <b>{Math.round(SELLER_PREMIUM_SHARE * 100)}% of the premium</b> as instant credit, and a notification.</p>
          <p>Example: your $100 booth is taken for $125. You receive ${100 + 25 * SELLER_PREMIUM_SHARE}. The buyer's booth is now worth $125, so the next takeover costs $156.25. Credit can be spent on any claim, takeover, boost or banner.</p>
          <p>Don't want to be bought? <b>Boost</b> your booth: every dollar you add raises both the price and your payout. Headliner booths get a 7-day shield and a notice before takeovers.</p>
        </section>
        <section className="space-y-2">
          <h2 className="text-2xl font-bold">3. Numbers that matter</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li><b>Impressions</b>: how many times your booth was on someone's screen.</li>
            <li><b>Visits</b> and <b>unique visitors</b>: people who opened your booth, on the floor or on your public page.</li>
            <li><b>CTR</b> and <b>referrers</b>: banner clicks, walk-ups, rankings, directory, your embed badge, X.</li>
            <li><b>Conversions</b>: add our one-line pixel and see sales next to clicks.</li>
          </ul>
        </section>
        <section className="space-y-2">
          <h2 className="text-2xl font-bold">4. Plans</h2>
          <ul className="grid gap-2 sm:grid-cols-3">
            {Object.entries(TIERS).map(([k, t]) => <li key={k} className="rounded-xl border border-white/10 bg-white/[0.03] p-3"><b>{t.name}</b> <span className="mono text-amber-300">{t.priceCents ? `${formatMoney(t.priceCents)}/30d` : "free"}</span><ul className="mt-1 text-sm text-slate-400">{t.perks.map((p) => <li key={p}>· {p}</li>)}</ul></li>)}
          </ul>
        </section>
        <section className="space-y-2">
          <h2 className="text-2xl font-bold">5. Hanging banners</h2>
          <p>It's indoors, so advertising hangs from the trusses. <b>{BILLBOARD_SLOTS.block.name}</b> from {formatMoney(BILLBOARD_SLOTS.block.priceCentsPerWeek)}/week: {BILLBOARD_SLOTS.block.blurb} <b>{BILLBOARD_SLOTS.airship.name}</b> {formatMoney(BILLBOARD_SLOTS.airship.priceCentsPerWeek)}/week: {BILLBOARD_SLOTS.airship.blurb} Live seen / opens / clicks on every banner.</p>
        </section>
        <section className="space-y-2">
          <h2 className="text-2xl font-bold">6. Arcade, coins and the walk</h2>
          <p>Coins are a free currency for showing up: +5 a day, more for streaks, +1 for each booth you explore, +50 for claiming. Spend them in the arcade in the middle of the hall or on the Hall Flyover drone ride. 100 coins convert to $1 of booth value, so playing grows your booth.</p>
          <p>Pick an avatar (body, skin tone, hair, outfit) and walk the floor in third or first person. Walk up to a booth and press E to open it; click a banner to visit the site.</p>
        </section>
        <section className="space-y-2">
          <h2 className="text-2xl font-bold">7. Rules & refunds</h2>
          <ul className="list-disc space-y-1 pl-5">
            <li>Full refund within 24 hours of a claim if your booth has had no clicks or takeovers.</li>
            <li>Plans renew every 30 days and can be canceled any time; perks run to the end of the period.</li>
            <li>No hate, scams, adult content or impersonation. We remove booths that break this and refund the current value as credit.</li>
            <li>Only exhibitors can post links in hall chat. Rate limits apply to everyone.</li>
          </ul>
        </section>
        <div className="flex gap-3"><Link href="/app?claim=1" className="btn-primary">Get a booth →</Link><Link href="/app" className="btn-ghost">Walk the floor</Link></div>
      </article>
    </Shell>
  );
}
