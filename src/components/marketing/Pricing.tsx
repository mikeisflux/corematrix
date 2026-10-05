import Link from "next/link";
import { BOOTH_SIZES, ZONES, TIERS, formatMoney, TAKEOVER_MULTIPLIER, SELLER_PREMIUM_SHARE, BILLBOARD_SLOTS } from "@/lib/config";
import { Tilt } from "./Fx";

const SIZE_META: Record<string, { c: string; who: string }> = {
  "6x10": { c: "#b06ad8", who: "Artists, indie creators" },
  "10x10": { c: "#00f5ff", who: "Shops, small press, podcasts" },
  "20x10": { c: "#5ee6c3", who: "Studios, mid-size publishers" },
  "20x20": { c: "#ffcf5c", who: "The big publishers and toy makers" },
};
export function Pricing() {
  return (
    <section id="pricing" className="relative z-10 mx-auto max-w-7xl px-5 py-24">
      <div className="mk-glow mk-glow--violet" style={{ width: 800, height: 500, left: "10%", top: "10%", opacity: 0.3 }} />
      <div className="mk-reveal mx-auto max-w-2xl text-center">
        <div className="mk-eyebrow">Booths</div>
        <h2 className="display mt-3 text-4xl font-extrabold leading-[1.02] md:text-5xl">Four sizes. Priced like a con, not like an ad network.</h2>
        <p className="mt-4 text-lg text-[var(--mk-muted)]">One-time price for the space. It&apos;s yours until someone pays you 1.25× to take it, and then you profit.</p>
      </div>
      <div className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        {(Object.keys(BOOTH_SIZES) as (keyof typeof BOOTH_SIZES)[]).map((k, i) => {
          const s = BOOTH_SIZES[k], m = SIZE_META[k];
          return (
            <Tilt key={k} className="mk-reveal">
              <div className="mk-card mk-card--glow flex h-full flex-col p-6" data-delay={String(i + 1)}>
                <div className="flex items-center justify-between"><span className="display text-2xl font-extrabold">{s.short}</span><span className="h-2.5 w-2.5 rounded-full" style={{ background: m.c, boxShadow: `0 0 16px ${m.c}` }} /></div>
                <div className="mt-1 text-sm text-slate-400">{s.name}</div>
                <div className="display mt-5 text-4xl font-extrabold">{formatMoney(s.priceCents)}<span className="text-base font-medium text-slate-400"> once</span></div>
                <p className="mt-3 flex-1 text-sm leading-relaxed text-[var(--mk-muted)]">{s.blurb}</p>
                <div className="mt-4 text-xs text-slate-500">{m.who}</div>
                <Link href={`/app?claim=1`} className="mk-btn mk-btn--ghost mt-5 !py-2.5 !text-sm">Pick a space</Link>
              </div>
            </Tilt>
          );
        })}
      </div>
      <div className="mk-reveal mt-6 grid gap-4 text-sm text-slate-400 md:grid-cols-2">
        <div className="mk-card p-5"><b className="text-white">{ZONES.headliner.name} ×{ZONES.headliner.mult}.</b> {ZONES.headliner.blurb} <b className="text-white">{ZONES.front.name} ×{ZONES.front.mult}.</b> {ZONES.front.blurb}</div>
        <div className="mk-card p-5"><b className="text-white">Plans, optional.</b> {TIERS.pro.name} {formatMoney(TIERS.pro.priceCents)}/30 days for 90-day analytics, referrers and a hanging sign. {TIERS.landmark.name} {formatMoney(TIERS.landmark.priceCents)}/30 days adds a takeover shield, the home-page strip and a tower-sized marquee.</div>
      </div>
      <div className="mk-reveal mt-4 text-center text-xs text-slate-500">Hanging banners for sponsors: {BILLBOARD_SLOTS.block.name} from {formatMoney(BILLBOARD_SLOTS.block.priceCentsPerWeek)}/week · {BILLBOARD_SLOTS.airship.name} {formatMoney(BILLBOARD_SLOTS.airship.priceCentsPerWeek)}/week. Takeovers at {TAKEOVER_MULTIPLIER}×, sellers keep {Math.round(SELLER_PREMIUM_SHARE * 100)}% of the premium.</div>
    </section>
  );
}

export function Economy() {
  const steps = [
    { n: "Claim", d: "Pick a space on the floor plan, set up your banner, pay once. You're live on the floor in a minute.", c: "#5ee6c3" },
    { n: "Get found", d: "Impressions on the floor, walk-ups, banner clicks, rankings, the directory, share cards and your embed badge. All counted, with referrers.", c: "#00f5ff" },
    { n: "Get taken over", d: "Someone wants your spot? They pay 1.25× your value. You get everything back plus 60% of the premium as credit, instantly.", c: "#ff2bd6" },
    { n: "Or defend it", d: "Boost your booth: every dollar raises the takeover price, your payout and your signage. Headliner plans add a 7-day shield.", c: "#ffcf5c" },
  ];
  return (
    <section id="economy" className="relative z-10 mx-auto max-w-7xl px-5 py-24">
      <div className="mk-reveal max-w-3xl">
        <div className="mk-eyebrow">The economy</div>
        <h2 className="display mt-3 text-4xl font-extrabold leading-[1.02] md:text-5xl">Takeovers nobody loses on.</h2>
        <p className="mt-4 text-lg text-[var(--mk-muted)]">Position is the status game. Headliner Row around the arcade and the front of house see the most traffic, and the floor reflects it: signage grows with value, from a tabletop card to a header banner, a hanging sign from the trusses, and a tower.</p>
      </div>
      <ol className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        {steps.map((s, i) => (
          <li key={s.n} className="mk-reveal mk-card p-6" data-delay={String(i + 1)}>
            <div className="display text-5xl font-extrabold" style={{ color: s.c, textShadow: `0 0 30px ${s.c}66` }}>{i + 1}</div>
            <h3 className="display mt-4 text-xl font-bold">{s.n}</h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--mk-muted)]">{s.d}</p>
          </li>
        ))}
      </ol>
      <div className="mk-reveal mt-10 grid gap-5 lg:grid-cols-2">
        <div className="mk-frame"><img src="/marketing/overview.jpg" alt="The whole exhibit hall from above" width={1920} height={1200} loading="lazy" /></div>
        <div className="mk-frame"><img src="/marketing/artist-alley.jpg" alt="Artists' Alley with 6-foot tables" width={1920} height={1200} loading="lazy" /></div>
      </div>
    </section>
  );
}
