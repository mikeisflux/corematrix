"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/hall/store";
import { runSnake } from "./games/snake";
import { runBreakout } from "./games/breakout";
import { runRunner } from "./games/runner";

export type GameRunner = (canvas: HTMLCanvasElement, onScore: (s: number) => void, onEnd: (s: number) => void) => () => void;
const RUNNERS: Record<string, GameRunner> = { snake: runSnake, breakout: runBreakout, runner: runRunner };

interface Row { rank: number; userId: string; playerName: string; boothId: number | null; score: number }

export function GameShell({ gameId, name, blurb, cost, prize, prizeAt }: { gameId: string; name: string; blurb: string; cost: number; prize: number; prizeAt: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const stop = useRef<(() => void) | null>(null);
  const [state, setState] = useState<"idle" | "playing" | "over">("idle");
  const [score, setScore] = useState(0);
  const [playId, setPlayId] = useState<string | null>(null);
  const [coins, setCoins] = useState<number | null>(null);
  const [result, setResult] = useState<{ score: number; prize: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [scope, setScope] = useState<"today" | "all">("today");
  const [board, setBoard] = useState<{ rows: Row[]; mine: { best: number; plays: number } | null; me: string | null }>({ rows: [], mine: null, me: null });

  const loadBoard = useCallback(() => api<typeof board>(`/api/arcade/leaderboard?game=${gameId}&scope=${scope}`).then(setBoard), [gameId, scope]);
  useEffect(() => { void loadBoard(); api<{ user: { coins: number } | null }>("/api/me").then((d) => setCoins(d.user?.coins ?? null)); }, [loadBoard]);

  const start = async () => {
    setErr(null);
    setResult(null);
    try {
      const r = await api<{ playId: string; coins: number }>("/api/arcade/start", { method: "POST", body: JSON.stringify({ gameId }) });
      setPlayId(r.playId);
      setCoins(r.coins);
      setScore(0);
      setState("playing");
      stop.current?.();
      stop.current = RUNNERS[gameId](canvas.current!, setScore, (final) => void finish(r.playId, final));
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const finish = async (pid: string, final: number) => {
    setState("over");
    try {
      const r = await api<{ score: number; prize: number; coins: number }>("/api/arcade/finish", { method: "POST", body: JSON.stringify({ playId: pid, score: final }) });
      setResult({ score: r.score, prize: r.prize });
      setCoins(r.coins);
      void loadBoard();
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  useEffect(() => () => stop.current?.(), []);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div><Link href="/app/arcade" className="text-xs text-slate-400 hover:text-white">← Arcade</Link><h1 className="text-2xl font-bold">{name}</h1><p className="text-sm text-slate-400">{blurb}</p></div>
          <div className="mono text-sm">{coins == null ? <Link className="text-amber-300 underline" href={`/app/login?next=/arcade/${gameId}`}>Sign in to play</Link> : <>{coins} coins</>}</div>
        </div>
        <div className="relative mt-4 overflow-hidden rounded-2xl border border-white/10 bg-[#070a16]">
          <canvas ref={canvas} width={640} height={480} className="block w-full" tabIndex={0} />
          {state !== "playing" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#070a16]/80 text-center">
              {result && <div><div className="text-[11px] uppercase tracking-[0.2em] text-slate-400">Final score</div><div className="mono text-5xl font-bold">{result.score.toLocaleString()}</div>{result.prize > 0 ? <div className="mt-1 text-emerald-400">+{result.prize} coins prize!</div> : <div className="mt-1 text-xs text-slate-400">{prizeAt.toLocaleString()}+ wins {prize} coins</div>}</div>}
              <button className="btn-primary" onClick={start} disabled={coins == null}>{state === "over" ? `Play again · ${cost} coins` : `Insert ${cost} coins`}</button>
              {err && <p className="text-xs text-rose-400">{err}</p>}
              <p className="text-[11px] text-slate-500">{gameId === "snake" ? "Arrows / WASD to steer" : gameId === "breakout" ? "Mouse or arrows to move" : "Space / click / tap to jump"}</p>
            </div>
          )}
          <div className="absolute left-3 top-3 mono text-sm text-white/80">{score.toLocaleString()}</div>
        </div>
      </div>
      <aside className="rounded-2xl border border-white/10 p-4">
        <div className="flex items-center justify-between"><div className="font-bold">Leaderboard</div><div className="flex rounded-lg bg-white/5 p-0.5 text-xs">{(["today", "all"] as const).map((s) => <button key={s} onClick={() => setScope(s)} className={`rounded-md px-2 py-1 capitalize ${scope === s ? "bg-amber-300 text-slate-950 font-semibold" : ""}`}>{s === "all" ? "Global" : "Today"}</button>)}</div></div>
        {board.mine && <div className="mt-3 rounded-xl bg-white/5 p-2 text-xs"><span className="text-slate-400">Your best</span> <span className="mono float-right">{board.mine.best.toLocaleString()} · {board.mine.plays} plays</span></div>}
        <ol className="mt-2 space-y-1">
          {board.rows.map((r) => (
            <li key={r.userId} className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${r.userId === board.me ? "bg-amber-300/15" : ""}`}>
              <span className={`mono w-6 ${r.rank <= 3 ? "text-amber-300 font-bold" : "text-slate-500"}`}>{r.rank}</span>
              <span className="min-w-0 flex-1 truncate">{r.boothId ? <Link className="hover:underline" href={`/app/booth/${r.boothId}`}>{r.playerName}</Link> : r.playerName}</span>
              <span className="mono">{r.score.toLocaleString()}</span>
            </li>
          ))}
          {board.rows.length === 0 && <li className="text-xs text-slate-500">No scores {scope === "today" ? "today" : "yet"}. First one on the board gets bragging rights in the feed.</li>}
        </ol>
      </aside>
    </div>
  );
}
