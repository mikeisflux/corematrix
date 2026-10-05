import Link from "next/link";
import { SITE_NAME } from "@/lib/config";

const QA = [
  ["Is this a real convention?", "It's a virtual one that never ends: a 3D exhibit hall in your browser. Real exhibitors, real links, real traffic numbers. No badge lines, no hotel block."],
  ["What do I actually get for the money?", "A permanent numbered booth on the floor plan with your banner, logo, tagline and website link, a public booth page with a share card, an embed badge, and analytics: impressions, unique visitors, clicks, CTR and referrers."],
  ["What happens if someone takes over my booth?", "They pay 1.25× your booth's value. You receive your full value back plus 60% of the premium as credit, instantly, with an email. Spend it on a new space, a takeover of your own, a boost or a banner."],
  ["Can I change my booth after I claim it?", "Name, banner style, colors, logo, link and description are free to edit any time and update on the floor instantly. Value only grows: boost it or let takeovers pay you."],
  ["Do I need an account to walk around?", "No. Walking the floor, the arcade and the directory are free for everyone. Create a free account (email and password) when you want coins, an avatar that follows you, or a booth."],
  ["How do payments work?", "Card payments are processed by DivinityCoin; we never see or store card details. Plans renew every 30 days and can be canceled any time. Full refund within 24 hours of a claim if your booth has had no clicks or takeovers."],
  ["What are the rules?", "No hate, scams, adult content or impersonation. We remove booths that break this and refund the current value as credit. Only exhibitors can post links in hall chat."],
];
export function Faq() {
  return (
    <section id="faq" className="relative z-10 mx-auto max-w-3xl px-5 py-24">
      <div className="mk-reveal text-center"><div className="mk-eyebrow">FAQ</div><h2 className="display mt-3 text-4xl font-extrabold md:text-5xl">Questions from the queue.</h2></div>
      <div className="mk-faq mk-reveal mt-10 border-b border-white/10" data-delay="1">
        {QA.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}
      </div>
      <p className="mk-reveal mt-8 text-center text-sm text-slate-400">More in <Link className="text-white underline decoration-white/30 underline-offset-4" href="/app/how-it-works">how it works</Link>.</p>
    </section>
  );
}

export function Cta() {
  return (
    <section className="relative z-10 mx-auto max-w-7xl px-5 pb-24 pt-10">
      <div className="mk-card relative overflow-hidden p-10 text-center md:p-16">
        <div className="mk-glow mk-glow--pink" style={{ width: 600, height: 400, left: "-10%", top: "-30%", opacity: 0.5 }} />
        <div className="mk-glow mk-glow--cyan" style={{ width: 600, height: 400, right: "-10%", bottom: "-40%", opacity: 0.4 }} />
        <div className="relative">
          <div className="mk-eyebrow">Doors never close</div>
          <h2 className="display mt-3 text-4xl font-extrabold leading-[1.02] md:text-6xl">Your booth is waiting<br />in Hall D.</h2>
          <p className="mx-auto mt-5 max-w-xl text-lg text-[var(--mk-muted)]">Pick a space on the floor plan, set up your banner, and be on the show floor in a minute. From $5, once.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3"><Link href="/app?claim=1" className="mk-btn mk-btn--primary">Get a booth</Link><Link href="/app" className="mk-btn mk-btn--ghost">Just walk around</Link></div>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="relative z-10 border-t border-white/8">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-8 text-sm text-slate-500">
        <div className="display font-bold text-slate-300">{SITE_NAME}</div>
        <nav className="flex flex-wrap gap-5">
          <Link className="hover:text-white" href="/app">The hall</Link><Link className="hover:text-white" href="/app/directory">Exhibitors</Link><Link className="hover:text-white" href="/app/rankings">Rankings</Link><Link className="hover:text-white" href="/app/seasons">Seasons</Link><Link className="hover:text-white" href="/app/arcade">Arcade</Link><Link className="hover:text-white" href="/app/how-it-works">Rules &amp; refunds</Link><Link className="hover:text-white" href="/app/login">Sign in</Link>
        </nav>
        <div>© {new Date().getFullYear()} {SITE_NAME}. Not affiliated with any convention.</div>
      </div>
    </footer>
  );
}
