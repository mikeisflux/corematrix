"use client";
import { useState } from "react";
import Link from "next/link";
import { api, useCity } from "@/lib/city/store";
import { formatMoney } from "@/lib/config";
import { PanelHeader, SignIn } from "./common";

const GAMES = [
  { id: "snake", name: "Serpent Ave.", blurb: "Classic snake. Eat, grow, don't crash.", cost: 2, prize: 25, at: 400 },
  { id: "breakout", name: "Block Party", blurb: "Smash the skyline brick by brick.", cost: 2, prize: 30, at: 800 },
  { id: "runner", name: "Rooftop Run", blurb: "One button. Endless rooftops.", cost: 3, prize: 40, at: 1500 },
];
const PACKS = [
  { id: "pack_small", coins: 100, priceCents: 199 },
  { id: "pack_med", coins: 350, priceCents: 499 },
  { id: "pack_big", coins: 1000, priceCents: 999 },
];

export function ArcadePanel() {
  const me = useCity((s) => s.me);
  const setMe = useCity((s) => s.setMe);
  const myPlots = useCity((s) => s.myPlots);
  const setRide = useCity((s) => s.setRide);
  const setPanel = useCity((s) => s.setPanel);
  const setToast = useCity((s) => s.setToast);
  const [err, setErr] = useState<string | null>(null);

  const ride = async () => {
    setErr(null);
    try {
      const r = await api<{ coins: number }>("/api/arcade/coaster", { method: "POST" });
      if (me) setMe({ ...me, coins: r.coins }, myPlots);
      setPanel("none");
      setRide(true);
      setToast("Hold on. 48 seconds over the skyline.");
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const buy = async (packId: string) => {
    try {
      const r = await api<{ url: string }>("/api/checkout", { method: "POST", body: JSON.stringify({ kind: "coins", packId }) });
      window.location.href = r.url;
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <>
      <PanelHeader title="Arcade & rides" sub={me ? `${me.coins} coins · ${me.streak}-day streak` : "Free coins every day you show up"} />
      <div className="space-y-3 p-3">
        <div className="rounded-xl border border-orange-400/30 bg-orange-400/10 p-3">
          <div className="flex items-center justify-between">
            <div><div className="font-bold">🎢 Skyline Coaster</div><div className="text-xs text-slate-300">A 48-second ride over every building on the avenue.</div></div>
            <button className="btn-primary" onClick={ride} disabled={!me}>5 coins</button>
          </div>
        </div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Machines</div>
        <ul className="space-y-1.5">
          {GAMES.map((g) => (
            <li key={g.id} className="flex items-center justify-between rounded-xl bg-white/[0.04] p-3">
              <div><div className="font-semibold">{g.name}</div><div className="text-xs text-slate-400">{g.blurb} · {g.at.toLocaleString()}+ pts wins {g.prize} coins</div></div>
              <Link href={`/arcade/${g.id}`} className="btn-ghost text-xs">{g.cost} coins</Link>
            </li>
          ))}
        </ul>
        {me ? (
          <>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">How coins work</div>
            <ul className="space-y-1 text-xs text-slate-300">
              <li>• <b>+5 every day</b> you visit, +1 per streak day (max +15)</li>
              <li>• <b>+1</b> for each new building you open (10/day)</li>
              <li>• <b>+50</b> when you claim a plot, <b>+25</b> per friend you refer</li>
              <li>• Win prizes in the machines; <b>100 coins = $1 of height</b> on your building</li>
            </ul>
            <div className="grid grid-cols-3 gap-1.5">
              {PACKS.map((p) => (
                <button key={p.id} onClick={() => buy(p.id)} className="rounded-xl border border-white/10 bg-white/[0.04] p-2 text-center hover:border-amber-300/50">
                  <div className="mono text-lg font-bold text-amber-300">{p.coins}</div>
                  <div className="text-[11px] text-slate-400">{formatMoney(p.priceCents)}</div>
                </button>
              ))}
            </div>
            {myPlots.length > 0 && <Link href="/dashboard#coins" className="btn-ghost w-full text-xs">Convert coins into building height →</Link>}
          </>
        ) : (
          <SignIn note="Sign in to play. New players start with free coins." />
        )}
        {err && <p className="text-xs text-rose-400">{err}</p>}
      </div>
    </>
  );
}
