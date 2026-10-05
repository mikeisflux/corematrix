import Link from "next/link";
import { CountUp, Tilt } from "./Fx";
import { formatMoney } from "@/lib/config";

interface Stats { claimed: number; totalBooths: number; totalViews: number; totalSalesCents: number; online: number }
export function Hero({ stats }: { stats: Stats }) {
  return (
    <section className="relative z-10 mx-auto max-w-7xl px-5 pb-10 pt-12 md:pt-24">
      <div className="mk-grid absolute inset-0 -z-10" aria-hidden />
      <div className="mx-auto max-w-4xl text-center">
        <div className="mk-reveal on inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
          <span className="mk-live inline-block h-2 w-2 rounded-full bg-[#5ee6c3]" /> Doors are open · {stats.online.toLocaleString()} on the floor right now
        </div>
        <h1 className="display mk-reveal on mt-6 text-[38px] font-extrabold leading-[0.98] sm:text-6xl md:text-[84px]" data-delay="1">
          The comic convention<br /><span className="mk-gradient-text">that never closes.</span>
        </h1>
        <p className="mk-reveal on mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-[var(--mk-muted)] md:text-xl" data-delay="2">
          One exhibit hall, laid out like San Diego&apos;s, open 24/7 in your browser. Publishers, artists and shops own real booths. Fans pick an avatar and walk the floor. Every banner is a door to the exhibitor&apos;s site.
        </p>
        <div className="mk-reveal on mt-9 flex flex-wrap items-center justify-center gap-3" data-delay="3">
          <Link href="/app?claim=1" className="mk-btn mk-btn--primary">Get a booth from $5</Link>
          <Link href="/app" className="mk-btn mk-btn--ghost">Walk the floor <span className="text-slate-400">·</span> free</Link>
        </div>
        <div className="mk-reveal on mt-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-sm text-slate-400" data-delay="4">
          {stats.claimed > 0 ? (<>
            <span><b className="text-white"><CountUp to={stats.claimed} /></b> booths claimed of {stats.totalBooths.toLocaleString()}</span>
            <span><b className="text-white"><CountUp to={stats.totalViews} /></b> visits</span>
            {stats.totalSalesCents > 0 && <span><b className="text-white">{formatMoney(stats.totalSalesCents)}</b> in booth sales</span>}
          </>) : (<>
            <span><b className="text-white">Opening week.</b> All {stats.totalBooths.toLocaleString()} spaces are open, including every island.</span>
            <span><b className="text-white">First come, first booth.</b> Headliner Row goes first.</span>
          </>)}
        </div>
      </div>
      <Tilt className="mk-reveal on relative mx-auto mt-14 max-w-6xl" >
        <div className="mk-glow mk-glow--gold" style={{ width: 500, height: 300, left: "20%", top: "-20%", opacity: 0.35 }} />
        <div className="mk-frame">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/marketing/hero.jpg" alt="The show floor: Headliner Row, island spaces, hanging banners and the arcade in the middle of the hall" width={1920} height={1200} loading="eager" />
          <div className="absolute inset-x-0 bottom-0 z-10 flex flex-wrap items-end justify-between gap-4 p-6 md:p-8">
            <div><div className="mk-eyebrow">Hall D · Headliner Row</div><div className="display mt-1 text-2xl font-bold md:text-3xl">1,042 spaces. Aisles 100 to 2800. Artists&apos; Alley at the east end.</div></div>
            <Link href="/app?booth=406" className="mk-btn mk-btn--ghost !py-3">Fly to an island booth →</Link>
          </div>
        </div>
        <FloatingCard className="left-[-14px] top-[12%] hidden md:block" r="-4deg" title="Takeovers pay the seller" sub="Buyer pays 1.25× · you keep the profit" color="#ff2bd6" />
        <FloatingCard className="right-[-18px] top-[38%] hidden md:block" r="3deg" title="Banner click → your site" sub="Impressions, visits, CTR, referrers" color="#00f5ff" delay="2s" />
      </Tilt>
    </section>
  );
}

function FloatingCard({ className, r, title, sub, color, delay }: { className: string; r: string; title: string; sub: string; color: string; delay?: string }) {
  return (
    <div className={`mk-card mk-float absolute z-20 w-[280px] p-4 ${className}`} style={{ ["--r" as string]: r, animationDelay: delay }}>
      <div className="flex items-center gap-3">
        <span className="h-9 w-9 shrink-0 rounded-xl" style={{ background: color, boxShadow: `0 0 24px ${color}` }} />
        <div className="min-w-0"><div className="truncate text-sm font-semibold">{title}</div><div className="truncate text-xs text-slate-400">{sub}</div></div>
      </div>
    </div>
  );
}
