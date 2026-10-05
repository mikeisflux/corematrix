import Link from "next/link";
import { Tilt } from "./Fx";

const PILLARS = [
  { k: "01", t: "A real floor plan", d: "Numbered aisles, Halls A–H, a cross aisle, island booths in the middle and Artists' Alley at the east end. If you've walked a big show, you already know the way.", c: "#ff2bd6" },
  { k: "02", t: "Booths that work", d: "Your banner, logo, tagline and link on the show floor, 24/7. A visitor clicks the banner and your site opens in a new tab. Every impression, visit and click is counted.", c: "#00f5ff" },
  { k: "03", t: "An economy with stakes", d: "Any booth can be taken over for 1.25× its value and the seller profits. Boost to defend, upgrade signage, climb the rankings, win the weekly season.", c: "#ffcf5c" },
];
export function Pillars() {
  return (
    <section id="floor" className="relative z-10 mx-auto max-w-7xl px-5 py-24">
      <div className="mk-hairline mb-16" />
      <div className="grid gap-6 md:grid-cols-3">
        {PILLARS.map((p, i) => (
          <Tilt key={p.k} className="mk-reveal" >
            <div className="mk-card mk-card--glow h-full p-7" data-delay={String(i + 1)}>
              <div className="mk-eyebrow">{p.k}</div>
              <h3 className="display mt-4 text-2xl font-bold">{p.t}</h3>
              <p className="mt-3 leading-relaxed text-[var(--mk-muted)]">{p.d}</p>
              <span className="absolute right-6 top-6 h-2 w-2 rounded-full" style={{ background: p.c, boxShadow: `0 0 18px ${p.c}` }} />
            </div>
          </Tilt>
        ))}
      </div>
    </section>
  );
}

export function Walk() {
  return (
    <section id="walk" className="relative z-10 mx-auto max-w-7xl px-5 py-20">
      <div className="mk-glow mk-glow--cyan" style={{ width: 600, height: 600, right: "-15%", top: "-10%", opacity: 0.25 }} />
      <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
        <div className="mk-reveal">
          <div className="mk-eyebrow">Walk it</div>
          <h2 className="display mt-3 text-4xl font-extrabold leading-[1.02] md:text-5xl">Pick an avatar.<br />Walk the hall.</h2>
          <p className="mt-5 text-lg leading-relaxed text-[var(--mk-muted)]">Body, skin tone, hair and outfit, saved to your account. Then WASD down aisle 1500, past the island towers, into the arcade. Third person or first person. Walk up to a booth, press E, read the pitch, click the banner.</p>
          <ul className="mt-6 grid gap-3 sm:grid-cols-2">
            {["Collision with every booth and cabinet", "Touch joystick on phones", "A wandering crowd and a robot mascot", "After-hours lighting with neon and bloom", "Drone flyover of the whole hall for 5 coins", "Deep links to any booth: /app?booth=1502"].map((t) => (
              <li key={t} className="flex items-start gap-2 text-sm text-slate-300"><span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#5ee6c3] shadow-[0_0_10px_#5ee6c3]" />{t}</li>
            ))}
          </ul>
          <div className="mt-8 flex gap-3"><Link href="/app?mode=walk" className="mk-btn mk-btn--primary">Start walking</Link><Link href="/app?night=1" className="mk-btn mk-btn--ghost">See it after hours</Link></div>
        </div>
        <div className="mk-reveal grid gap-4" data-delay="2">
          <div className="mk-frame"><img src="/marketing/walk.jpg" alt="Walking the floor in third person" width={1920} height={1200} loading="lazy" /></div>
          <div className="mk-frame"><img src="/marketing/walk-night.jpg" alt="The hall after hours, neon on" width={1920} height={1200} loading="lazy" /></div>
        </div>
      </div>
    </section>
  );
}

export function Arcade() {
  return (
    <section className="relative z-10 mx-auto max-w-7xl px-5 py-20">
      <div className="grid items-center gap-12 lg:grid-cols-[1fr_1.1fr]">
        <div className="mk-reveal order-2 lg:order-1"><div className="mk-frame"><img src="/marketing/arcade-night.jpg" alt="The arcade plaza in the middle of the hall at night" width={1920} height={1200} loading="lazy" /></div></div>
        <div className="mk-reveal order-1 lg:order-2" data-delay="1">
          <div className="mk-eyebrow mk-neon !text-[#ff2bd6]">Dead center</div>
          <h2 className="display mt-3 text-4xl font-extrabold leading-[1.02] md:text-5xl">An arcade in the middle of the hall.</h2>
          <p className="mt-5 text-lg leading-relaxed text-[var(--mk-muted)]">Coins are free for showing up: +5 a day, more for streaks, +1 for every booth you explore. Spend them on original cabinets with daily and all-time leaderboards. 100 coins turn into $1 of booth value, so playing grows your booth.</p>
          <div className="mt-7 grid grid-cols-3 gap-3 text-center">
            {[["Serpent", "snake"], ["Longbox Party", "breakout"], ["Aisle Run", "runner"]].map(([n, g]) => <Link key={g} href={`/app/arcade/${g}`} className="mk-card mk-card--glow p-4 text-sm font-semibold hover:text-white">{n}</Link>)}
          </div>
        </div>
      </div>
    </section>
  );
}

const ROW = ["Publishers", "Artists' Alley", "Small Press", "Toys & Collectibles", "Tabletop", "Video Games", "Film & TV", "Podcasts", "Cosplay", "Back Issues", "Golden Age", "Webcomics", "Prints & Commissions", "Fan Clubs", "Retailers"];
export function Marquee() {
  const items = [...ROW, ...ROW];
  return (
    <div className="relative z-10 overflow-hidden border-y border-white/8 py-5" aria-hidden>
      <div className="mk-marquee gap-10 text-sm font-semibold uppercase tracking-[0.2em] text-slate-500">
        {items.map((t, i) => <span key={i} className="whitespace-nowrap">{t} <span className="mx-4 text-[#ffcf5c]">✦</span></span>)}
      </div>
      <p className="sr-only">Who exhibits: publishers, artists, small press, toy makers, game studios, media, retailers and fan communities.</p>
    </div>
  );
}
