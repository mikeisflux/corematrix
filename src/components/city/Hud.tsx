"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useCity } from "@/lib/city/store";
import { formatCount, formatMoney, SITE_NAME } from "@/lib/config";
import { timeAgo } from "@/lib/util";
import { PlotPanel } from "./panels/PlotPanel";
import { RankingsPanel } from "./panels/RankingsPanel";
import { SearchPanel } from "./panels/SearchPanel";
import { ChatPanel } from "./panels/ChatPanel";
import { StatsPanel } from "./panels/StatsPanel";
import { ArcadePanel } from "./panels/ArcadePanel";
import { BillboardsPanel } from "./panels/BillboardsPanel";
import { MePanel } from "./panels/MePanel";
import { ClaimPanel } from "./panels/ClaimPanel";

export function Hud() {
  const stats = useCity((s) => s.stats);
  const panel = useCity((s) => s.panel);
  const setPanel = useCity((s) => s.setPanel);
  const night = useCity((s) => s.night);
  const toggleNight = useCity((s) => s.toggleNight);
  const me = useCity((s) => s.me);
  const toast = useCity((s) => s.toast);
  const setToast = useCity((s) => s.setToast);
  const events = useCity((s) => s.events);
  const loaded = useCity((s) => s.loaded);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast, setToast]);

  const latest = events[0];

  return (
    <div className="pointer-events-none absolute inset-0 select-none">
      {/* top center: live numbers */}
      <div className="absolute left-1/2 top-3 -translate-x-1/2 fade-up">
        <button onClick={() => setPanel(panel === "stats" ? "none" : "stats")} className="pointer-events-auto panel flex items-center gap-4 rounded-full px-4 py-2 text-sm hover:border-white/20">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />{stats?.online ?? 1} online</span>
          <span className="text-slate-400">|</span>
          <span>👁 {formatCount(stats?.totalViews ?? 0)} visits</span>
          <span className="text-slate-400">|</span>
          <span>{stats?.claimed ?? 0}/{stats?.totalPlots ?? 0} plots</span>
        </button>
      </div>

      {/* top-left brand + sales + CTA */}
      <div className="absolute left-3 top-3 flex w-[360px] max-w-[calc(100vw-24px)] flex-col gap-2 fade-up">
        <div className="pointer-events-auto panel flex items-center justify-between rounded-2xl px-4 py-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">{SITE_NAME} · total sales</div>
            <div className="mono text-xl font-bold text-amber-300">{formatMoney(stats?.totalSalesCents ?? 0)}</div>
          </div>
          <button onClick={() => setPanel("claim")} className="btn-primary">Claim a plot from $5</button>
        </div>
        {latest && (
          <button onClick={() => latest.plotId && useCity.getState().select(latest.plotId)} className="pointer-events-auto panel flex items-center gap-2 rounded-xl px-3 py-2 text-left text-xs">
            <span className="h-2 w-2 shrink-0 rounded-full bg-amber-300 animate-pulse" />
            <span className="truncate"><b>{latest.title}</b>{latest.detail ? ` · ${latest.detail}` : ""}</span>
            <span className="ml-auto shrink-0 text-slate-400 mono">{timeAgo(latest.createdAt)}</span>
          </button>
        )}
        {panel !== "none" && (
          <div className="pointer-events-auto panel max-h-[calc(100vh-150px)] overflow-y-auto scroll rounded-2xl fade-up">
            {panel === "plot" && <PlotPanel />}
            {panel === "rankings" && <RankingsPanel />}
            {panel === "search" && <SearchPanel />}
            {panel === "chat" && <ChatPanel />}
            {panel === "stats" && <StatsPanel />}
            {panel === "arcade" && <ArcadePanel />}
            {panel === "billboards" && <BillboardsPanel />}
            {panel === "me" && <MePanel />}
            {panel === "claim" && <ClaimPanel />}
          </div>
        )}
        {panel === "none" && loaded && <LiveFeed />}
      </div>

      {/* right rail */}
      <div className="absolute right-3 top-3 flex flex-col gap-1 panel rounded-2xl p-1 fade-up pointer-events-auto">
        <RailButton label="Rankings" active={panel === "rankings"} onClick={() => setPanel(panel === "rankings" ? "none" : "rankings")} icon="🏆" />
        <RailButton label="Search" active={panel === "search"} onClick={() => setPanel(panel === "search" ? "none" : "search")} icon="🔍" />
        <RailButton label="Chat" active={panel === "chat"} onClick={() => setPanel(panel === "chat" ? "none" : "chat")} icon="💬" />
        <RailButton label="Arcade" active={panel === "arcade"} onClick={() => setPanel(panel === "arcade" ? "none" : "arcade")} icon="🕹️" />
        <RailButton label="Billboards" active={panel === "billboards"} onClick={() => setPanel(panel === "billboards" ? "none" : "billboards")} icon="📣" />
        <RailButton label={me ? "Account" : "Sign in"} active={panel === "me"} onClick={() => setPanel(panel === "me" ? "none" : "me")} icon={me ? "👤" : "➜"} badge={me?.unread} />
      </div>

      {/* bottom right controls */}
      <div className="absolute bottom-3 right-3 flex flex-col gap-1 panel rounded-2xl p-1 pointer-events-auto">
        <RailButton label={night ? "Day" : "Night"} onClick={toggleNight} icon={night ? "☀️" : "🌙"} />
        <RailButton label="Ride the coaster" onClick={() => setPanel("arcade")} icon="🎢" />
        <Link href="/rankings" className="hidden" aria-hidden />
      </div>

      {/* bottom-left: nav + coins */}
      <div className="absolute bottom-3 left-3 flex items-center gap-2 pointer-events-auto">
        <nav className="panel flex items-center gap-1 rounded-full px-2 py-1 text-xs">
          <Link className="rounded-full px-3 py-1.5 hover:bg-white/10" href="/directory">Directory</Link>
          <Link className="rounded-full px-3 py-1.5 hover:bg-white/10" href="/rankings">Rankings</Link>
          <Link className="rounded-full px-3 py-1.5 hover:bg-white/10" href="/arcade">Arcade</Link>
          <Link className="rounded-full px-3 py-1.5 hover:bg-white/10" href="/how-it-works">How it works</Link>
          {me && <Link className="rounded-full px-3 py-1.5 text-amber-300 hover:bg-white/10" href="/dashboard">Dashboard</Link>}
        </nav>
        {me && (
          <button onClick={() => setPanel("arcade")} className="panel rounded-full px-3 py-1.5 text-xs mono"><span className="text-amber-300">●</span> {me.coins} coins</button>
        )}
      </div>

      {toast && (
        <div className="absolute bottom-16 left-1/2 -translate-x-1/2 panel rounded-full px-4 py-2 text-sm fade-up">{toast}</div>
      )}
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-[var(--bg)]/70 text-sm text-slate-300">Building the city…</div>
      )}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 hidden md:block text-[10px] text-slate-400/80 mono">drag to orbit · scroll to zoom · WASD/arrows to pan · click a building</div>
    </div>
  );
}

function RailButton({ label, onClick, icon, active, badge }: { label: string; onClick: () => void; icon: string; active?: boolean; badge?: number }) {
  return (
    <button title={label} onClick={onClick} className={`relative flex h-10 w-10 items-center justify-center rounded-xl text-lg transition hover:bg-white/10 ${active ? "bg-amber-300/20 ring-1 ring-amber-300/60" : ""}`}>
      <span aria-hidden>{icon}</span>
      <span className="sr-only">{label}</span>
      {badge ? <span className="absolute -right-0.5 -top-0.5 rounded-full bg-rose-500 px-1 text-[9px] font-bold">{badge}</span> : null}
    </button>
  );
}

function LiveFeed() {
  const events = useCity((s) => s.events);
  const plots = useCity((s) => s.plots);
  const select = useCity((s) => s.select);
  const setFlyTo = useCity((s) => s.setFlyTo);
  const [open, setOpen] = useState(true);
  const top = Array.from(plots.values()).sort((a, b) => b.valueCents - a.valueCents).slice(0, 6);
  return (
    <div className="pointer-events-auto panel rounded-2xl p-3 max-h-[calc(100vh-170px)] overflow-y-auto scroll">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Top buildings</div>
        <button onClick={() => setOpen((o) => !o)} className="text-xs text-slate-400 hover:text-white">{open ? "hide" : "show"}</button>
      </div>
      {open && (
        <ol className="mt-2 space-y-1">
          {top.map((p, i) => (
            <li key={p.id}>
              <button onClick={() => { select(p.id); setFlyTo(p.id); }} className="flex w-full items-center gap-3 rounded-xl px-2 py-1.5 text-left hover:bg-white/5">
                <span className="mono w-5 text-xs text-amber-300">{String(i + 1).padStart(2, "0")}</span>
                <img src={`/api/logo/${p.id}`} alt="" className="h-8 w-8 rounded-lg bg-white/10 object-cover" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{p.name}</span>
                  <span className="block truncate text-[11px] text-slate-400">Plot #{p.id} · {formatCount(p.totalViews)} views · {p.views7d ?? 0} this week</span>
                </span>
                <span className="mono text-sm text-amber-300">{formatMoney(p.valueCents)}</span>
              </button>
            </li>
          ))}
        </ol>
      )}
      <div className="mt-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Live</div>
      <ul className="mt-1 space-y-1 text-xs">
        {events.slice(0, 8).map((e) => (
          <li key={e.id}>
            <button onClick={() => e.plotId && (select(e.plotId), setFlyTo(e.plotId))} className="flex w-full items-start gap-2 rounded-lg px-2 py-1 text-left hover:bg-white/5">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: e.type === "takeover" ? "#ff6b6b" : e.type === "claim" ? "#5ee6c3" : "#ffcf5c" }} />
              <span className="min-w-0 flex-1"><span className="font-medium">{e.title}</span>{e.detail && <span className="text-slate-400"> · {e.detail}</span>}</span>
              <span className="shrink-0 text-slate-500 mono">{timeAgo(e.createdAt)}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
