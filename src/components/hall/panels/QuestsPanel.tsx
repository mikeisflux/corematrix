"use client";
import { useEffect, useState } from "react";
import { useHall } from "@/lib/hall/store";
import { PanelHeader, SignIn } from "./common";
import { useQuests, refreshQuests, claimQuest } from "@/lib/hall/quests";

const fmt = (id: string, n: number, goal: number) => (id === "theater" ? `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")} / ${goal / 60}:00` : `${n} / ${goal}`);

export function QuestsPanel() {
  const me = useHall((s) => s.me);
  const board = useQuests();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { void refreshQuests(); }, [me]);
  const claim = async (q: "visit" | "theater" | "arcade" | "bonus") => {
    setBusy(q); setErr(null);
    try { await claimQuest(q); } catch (e) { setErr((e as Error).message); } finally { setBusy(null); }
  };
  const claimedCoins = board ? board.quests.filter((q) => q.claimed).reduce((n, q) => n + q.coins, 0) + (board.bonus.claimed ? board.bonus.coins : 0) : 0;
  return (
    <>
      <PanelHeader title="Daily quests" sub={me ? (board ? `${claimedCoins} coins collected today · resets midnight UTC` : "Loading…") : "Three things a day, coins for each"} />
      <div className="space-y-2 p-3">
        {!me && <SignIn note="Sign in to take on today's quests. Coins convert into booth value, which the weekly rankings count." />}
        {me && board && (
          <>
            {board.quests.map((q) => (
              <div key={q.id} className={`rounded-xl border p-3 ${q.done && !q.claimed ? "border-amber-300/50 bg-amber-300/10" : "border-white/10 bg-white/[0.04]"}`}>
                <div className="flex items-start gap-3">
                  <span className="text-xl leading-none">{q.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">{q.title}</div>
                    <div className="text-[11px] text-slate-400">{q.detail}</div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10"><div className={`h-full rounded-full ${q.claimed ? "bg-emerald-400" : "bg-amber-300"}`} style={{ width: `${Math.round((q.progress / q.goal) * 100)}%` }} /></div>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-slate-400 mono"><span>{fmt(q.id, q.progress, q.goal)}</span><span>+{q.coins} coins</span></div>
                  </div>
                </div>
                {q.done && !q.claimed && <button onClick={() => claim(q.id)} disabled={busy === q.id} className="btn-primary mt-2 w-full">Collect {q.coins} coins</button>}
                {q.claimed && <div className="mt-2 text-center text-[11px] text-emerald-300">✓ Collected</div>}
              </div>
            ))}
            <div className={`rounded-xl border p-3 text-sm ${board.bonus.ready ? "border-amber-300/50 bg-amber-300/10" : "border-white/10 bg-white/[0.04]"}`}>
              <div className="flex items-center justify-between">
                <div><div className="font-semibold">🏅 All three in a day</div><div className="text-[11px] text-slate-400">Finish and collect every quest for a bonus.</div></div>
                <span className="mono text-[11px] text-slate-400">+{board.bonus.coins}</span>
              </div>
              {board.bonus.ready && <button onClick={() => claim("bonus")} disabled={busy === "bonus"} className="btn-primary mt-2 w-full">Collect {board.bonus.coins} bonus coins</button>}
              {board.bonus.claimed && <div className="mt-2 text-center text-[11px] text-emerald-300">✓ Collected · see you tomorrow</div>}
            </div>
            <p className="text-[11px] text-slate-400">Coins turn into booth value from your dashboard, and booth value is what the weekly rankings count. Back a booth, or your own.</p>
          </>
        )}
        {err && <p className="text-xs text-rose-400">{err}</p>}
      </div>
    </>
  );
}
