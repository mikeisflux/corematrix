"use client";
/** The slot machine: pick a bet, spin, watch three reels settle on the server's draw. Pay table and today's big wins beside it. */
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/hall/store";
import { SLOT_BETS, SLOT_PAIRS, SLOT_SYMBOLS, type SlotSymbol } from "@/lib/slots-table";

interface Board { rows: Array<{ userId: string; name: string; win: number; at: number }>; mine: { spins: number; bet: number; won: number } | null; coins: number | null }
interface Spin { reels: SlotSymbol[]; mult: number; line: string | null; win: number; coins: number }
const glyph = (id: SlotSymbol) => SLOT_SYMBOLS.find((s) => s.id === id)!.glyph;
const ALL = SLOT_SYMBOLS.map((s) => s.id);

export function Slots({ rtp }: { rtp: number }) {
  const [bet, setBet] = useState<number>(2);
  const [coins, setCoins] = useState<number | null>(null);
  const [board, setBoard] = useState<Board | null>(null);
  const [shown, setShown] = useState<SlotSymbol[]>(["seven", "gem", "hero"]);
  const [turning, setTurning] = useState<boolean[]>([false, false, false]);
  const [last, setLast] = useState<Spin | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const timers = useRef<number[]>([]); const stopped = useRef([false, false, false]);
  const load = useCallback(() => api<Board>("/api/slots/spin").then((b) => { setBoard(b); setCoins(b.coins); }).catch(() => {}), []);
  useEffect(() => { void load(); const t = timers.current; return () => t.forEach(clearTimeout); }, [load]);

  const spin = async () => {
    if (busy) return;
    setBusy(true); setErr(null); setLast(null);
    try {
      const r = await api<Spin>("/api/slots/spin", { method: "POST", body: JSON.stringify({ bet }) });
      setCoins(r.coins - r.win); // the bet is gone while the reels turn; the win lands when they stop
      setTurning([true, true, true]); stopped.current = [false, false, false];
      // every reel flickers through the strip, and they stop left to right
      const flick = window.setInterval(() => setShown((s) => s.map((v, i) => (stopped.current[i] ? v : ALL[Math.floor(Math.random() * ALL.length)]))), 70);
      const stopAt = (i: number, ms: number) => timers.current.push(window.setTimeout(() => {
        stopped.current[i] = true;
        setTurning((t) => { const n = [...t]; n[i] = false; return n; });
        setShown((s) => { const n = [...s]; n[i] = r.reels[i]; return n; });
        if (i === 2) { clearInterval(flick); setLast(r); setCoins(r.coins); setBusy(false); void load(); }
      }, ms));
      stopAt(0, 900); stopAt(1, 1400); stopAt(2, 1900);
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  };
  return (
    <div className="grid gap-6 pt-6 lg:grid-cols-[1fr_320px]">
      <div>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div><div className="flex gap-3 text-xs"><Link href="/app/arcade" className="text-slate-400 hover:text-white">← Arcade</Link><Link href="/app?mode=walk&arcade=1" className="text-amber-300 hover:text-white">← Back to the show floor</Link></div><h1 className="text-2xl font-bold">Lucky Longbox Slots</h1><p className="text-sm text-slate-400">Three reels, your coins on the line. Three sevens pay 150 times the bet.</p></div>
          <div className="mono text-sm">{coins == null ? <Link className="text-amber-300 underline" href="/app/login?next=/app/arcade/slots">Sign in to play</Link> : <>{coins} coins</>}</div>
        </div>
        <div className="mt-4 rounded-2xl border border-amber-300/30 bg-gradient-to-b from-[#1a1033] to-[#070a16] p-5 shadow-[0_0_60px_rgba(255,209,102,0.08)]">
          <div className="mx-auto grid max-w-md grid-cols-3 gap-3">
            {shown.map((s, i) => (
              <div key={i} data-reel={i} className={`flex aspect-[3/4] items-center justify-center rounded-xl border bg-[#0b0f1f] text-6xl shadow-inner ${turning[i] ? "border-white/20 blur-[1px]" : last && last.mult > 0 ? "border-amber-300 shadow-[0_0_24px_rgba(255,209,102,0.35)]" : "border-white/10"}`}>
                <span className={turning[i] ? "animate-pulse" : ""}>{glyph(s)}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 min-h-[2.5rem] text-center" aria-live="polite">
            {last && last.mult > 0 && <div className="text-lg font-bold text-amber-300">{last.line}! +{last.win} coins{last.mult === 1 ? " (bet back)" : ""}</div>}
            {last && last.mult === 0 && <div className="text-sm text-slate-400">No line this time.</div>}
            {err && <div className="text-xs text-rose-400">{err}</div>}
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
            <span className="text-[11px] uppercase tracking-wider text-slate-400">Bet</span>
            {SLOT_BETS.map((b) => <button key={b} onClick={() => setBet(b)} disabled={busy} className={`mono rounded-lg px-3 py-1.5 text-sm ${bet === b ? "bg-amber-300 font-bold text-slate-950" : "bg-white/5 hover:bg-white/10"}`}>{b}</button>)}
          </div>
          <div className="mt-4 text-center">
            <button className="btn-primary px-8 py-3 text-lg" onClick={() => void spin()} disabled={coins == null || busy || (coins ?? 0) < bet} data-spin>{busy ? "Spinning…" : `Spin · ${bet} coin${bet === 1 ? "" : "s"}`}</button>
            {coins != null && coins < bet && !busy && <div className="mt-2 text-xs text-slate-400">Not enough coins for that bet. Lower it, or grab a pack in the arcade.</div>}
          </div>
          <p className="mt-4 text-center text-[11px] text-slate-500">The reels are drawn on the server. Over many spins the machine pays back about {Math.round(rtp * 100)} coins per 100 bet; the rest is the house's. Coins never cash out.</p>
        </div>
      </div>
      <aside className="space-y-4">
        <div className="rounded-2xl border border-white/10 p-4">
          <div className="font-bold">Pay table <span className="text-xs font-normal text-slate-400">× your bet</span></div>
          <ul className="mt-2 space-y-1 text-sm">
            {SLOT_SYMBOLS.map((s) => <li key={s.id} className="flex items-center justify-between"><span>{s.glyph}{s.glyph}{s.glyph} <span className="text-xs text-slate-400">{s.name}</span></span><span className="mono text-amber-300">{s.triple}×</span></li>)}
            {SLOT_PAIRS.map((p) => <li key={p.label} className="flex items-center justify-between text-slate-300"><span>{p.label}</span><span className="mono">{p.pays}×</span></li>)}
          </ul>
        </div>
        <div className="rounded-2xl border border-white/10 p-4">
          <div className="font-bold">Biggest wins today</div>
          {board?.mine && board.mine.spins > 0 && <div className="mt-2 rounded-xl bg-white/5 p-2 text-xs"><span className="text-slate-400">You</span> <span className="mono float-right">{board.mine.spins} spins · bet {board.mine.bet} · won {board.mine.won}</span></div>}
          <ol className="mt-2 space-y-1">
            {board?.rows.map((r, i) => <li key={`${r.userId}-${r.at}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm"><span className={`mono w-6 ${i < 3 ? "text-amber-300 font-bold" : "text-slate-500"}`}>{i + 1}</span><span className="min-w-0 flex-1 truncate">{r.name}</span><span className="mono">+{r.win}</span></li>)}
            {board && board.rows.length === 0 && <li className="text-xs text-slate-500">No wins yet today. The first big one goes here.</li>}
          </ol>
        </div>
      </aside>
    </div>
  );
}
