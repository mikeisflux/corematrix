import Link from "next/link";
import { Shell } from "@/components/pages/Shell";
import { GAMES, leaderboard, COIN_RULES } from "@/lib/arcade";
import { currentUser } from "@/lib/auth";
import { formatMoney } from "@/lib/config";

export const metadata = { title: "Arcade" };
export const dynamic = "force-dynamic";

export default async function Arcade() {
  const user = await currentUser();
  const boards = await Promise.all((Object.keys(GAMES) as Array<keyof typeof GAMES>).map(async (id) => ({ id, today: await leaderboard(id, "today", 3), all: await leaderboard(id, "all", 3) })));
  return (
    <Shell wide>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">Arcade</h1>
          <p className="text-sm text-slate-400">Original machines, daily and all-time leaderboards, coin prizes. Coins turn into building height: {COIN_RULES.convertRate} coins = $1.</p>
        </div>
        {!user && <Link href="/login?next=/arcade" className="btn-primary">Sign in to play (free coins)</Link>}
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {boards.map((b) => {
          const g = GAMES[b.id];
          return (
            <div key={b.id} className="flex flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="flex items-baseline justify-between"><h2 className="text-xl font-bold">{g.name}</h2><span className="mono text-xs text-amber-300">{g.cost} coins</span></div>
              <p className="text-sm text-slate-400">{g.blurb} Score {g.prizeAt.toLocaleString()}+ to win {g.prize} coins.</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div><div className="text-[10px] uppercase tracking-wider text-slate-500">Today</div>{b.today.length ? b.today.map((r) => <div key={r.userId} className="flex justify-between"><span className="truncate">{r.rank}. {r.playerName}</span><span className="mono">{r.score}</span></div>) : <div className="text-slate-600">No scores yet</div>}</div>
                <div><div className="text-[10px] uppercase tracking-wider text-slate-500">All time</div>{b.all.length ? b.all.map((r) => <div key={r.userId} className="flex justify-between"><span className="truncate">{r.rank}. {r.playerName}</span><span className="mono">{r.score}</span></div>) : <div className="text-slate-600">Be the first</div>}</div>
              </div>
              <Link href={`/arcade/${b.id}`} className="btn-primary mt-4">Play</Link>
            </div>
          );
        })}
      </div>
      <div className="mt-8 rounded-2xl border border-white/10 p-4 text-sm text-slate-300">
        <b>Coin packs:</b> {COIN_RULES.packs.map((p) => `${p.coins} for ${formatMoney(p.priceCents)}`).join(" · ")}. Free coins: +{COIN_RULES.dailyVisit}/day, streak bonus, +{COIN_RULES.explore} per building explored, +{COIN_RULES.claim} per claim, +{COIN_RULES.referral} per referral.
      </div>
    </Shell>
  );
}
