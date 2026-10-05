"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useHall } from "@/lib/hall/store";
import { formatCount, formatMoney, SITE_NAME } from "@/lib/config";
import { timeAgo } from "@/lib/util";
import { boothSpace } from "@/lib/hall/layout";
import { input } from "./Avatar";
import { BoothPanel } from "./panels/BoothPanel";
import { RankingsPanel } from "./panels/RankingsPanel";
import { SearchPanel } from "./panels/SearchPanel";
import { ChatPanel } from "./panels/ChatPanel";
import { StatsPanel } from "./panels/StatsPanel";
import { ArcadePanel } from "./panels/ArcadePanel";
import { BillboardsPanel } from "./panels/BillboardsPanel";
import { MePanel } from "./panels/MePanel";
import { ClaimPanel } from "./panels/ClaimPanel";
import { AvatarPanel } from "./panels/AvatarPanel";

export function Hud() {
  const stats = useHall((s) => s.stats);
  const panel = useHall((s) => s.panel);
  const setPanel = useHall((s) => s.setPanel);
  const night = useHall((s) => s.night);
  const toggleNight = useHall((s) => s.toggleNight);
  const me = useHall((s) => s.me);
  const toast = useHall((s) => s.toast);
  const setToast = useHall((s) => s.setToast);
  const events = useHall((s) => s.events);
  const loaded = useHall((s) => s.loaded);
  const mode = useHall((s) => s.mode);
  const setMode = useHall((s) => s.setMode);
  const near = useHall((s) => s.near);
  const booths = useHall((s) => s.booths);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 5000); return () => clearTimeout(t); }, [toast, setToast]);
  const latest = events[0];
  const nearBooth = near ? booths.get(near) : null;
  const toggle = (p: typeof panel) => setPanel(panel === p ? "none" : p);

  return (
    <div className="pointer-events-none absolute inset-0 select-none">
      <div className="absolute left-1/2 top-3 flex -translate-x-1/2 flex-col items-center gap-2 fade-up">
        <button onClick={() => toggle("stats")} className="pointer-events-auto panel flex items-center gap-4 rounded-full px-4 py-2 text-sm hover:border-white/20">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />{stats?.online ?? 1} on the floor</span>
          <span className="text-slate-400">|</span>
          <span>👁 {formatCount(stats?.totalViews ?? 0)} visits</span>
          <span className="text-slate-400">|</span>
          <span>{stats?.claimed ?? 0}/{stats?.totalBooths ?? 0} booths</span>
        </button>
        <FeaturedStrip />
      </div>

      <div className="absolute left-3 top-3 flex w-[360px] max-w-[calc(100vw-24px)] flex-col gap-2 fade-up">
        <div className="pointer-events-auto panel flex items-center justify-between rounded-2xl px-4 py-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">{SITE_NAME} · total sales</div>
            <div className="mono text-xl font-bold text-amber-300">{formatMoney(stats?.totalSalesCents ?? 0)}</div>
          </div>
          <button onClick={() => setPanel("claim")} className="btn-primary">Get a booth from $5</button>
        </div>
        {latest && (
          <button onClick={() => latest.boothId && useHall.getState().select(latest.boothId)} className="pointer-events-auto panel flex items-center gap-2 rounded-xl px-3 py-2 text-left text-xs">
            <span className="h-2 w-2 shrink-0 rounded-full bg-amber-300 animate-pulse" />
            <span className="truncate"><b>{latest.title}</b>{latest.detail ? ` · ${latest.detail}` : ""}</span>
            <span className="ml-auto shrink-0 text-slate-400 mono">{timeAgo(latest.createdAt)}</span>
          </button>
        )}
        {panel !== "none" && (
          <div className="pointer-events-auto panel max-h-[calc(100vh-150px)] overflow-y-auto scroll rounded-2xl fade-up">
            {panel === "booth" && <BoothPanel />}
            {panel === "rankings" && <RankingsPanel />}
            {panel === "search" && <SearchPanel />}
            {panel === "chat" && <ChatPanel />}
            {panel === "stats" && <StatsPanel />}
            {panel === "arcade" && <ArcadePanel />}
            {panel === "billboards" && <BillboardsPanel />}
            {panel === "me" && <MePanel />}
            {panel === "claim" && <ClaimPanel />}
            {panel === "avatar" && <AvatarPanel />}
          </div>
        )}
        {panel === "none" && loaded && mode === "map" && <LiveFeed />}
      </div>

      <div className="absolute right-3 top-3 flex flex-col gap-1 panel rounded-2xl p-1 fade-up pointer-events-auto">
        <RailButton label="Rankings" active={panel === "rankings"} onClick={() => toggle("rankings")} icon="🏆" />
        <RailButton label="Search" active={panel === "search"} onClick={() => toggle("search")} icon="🔍" />
        <RailButton label="Hall chat" active={panel === "chat"} onClick={() => toggle("chat")} icon="💬" />
        <RailButton label="Arcade" active={panel === "arcade"} onClick={() => toggle("arcade")} icon="🕹️" />
        <RailButton label="Hanging banners" active={panel === "billboards"} onClick={() => toggle("billboards")} icon="🪧" />
        <RailButton label={me ? "Account" : "Sign in"} active={panel === "me"} onClick={() => toggle("me")} icon={me ? "👤" : "➜"} badge={me?.unread} />
      </div>

      {/* mode switch + lights */}
      <div className="absolute bottom-3 right-3 flex flex-col gap-1 panel rounded-2xl p-1 pointer-events-auto">
        <RailButton label={mode === "walk" ? "Back to the map" : "Walk the floor"} active={mode === "walk"} onClick={() => { if (mode === "walk") setMode("map"); else { setMode("walk"); setPanel("none"); } }} icon={mode === "walk" ? "🗺️" : "🚶"} />
        <RailButton label="Your avatar" active={panel === "avatar"} onClick={() => toggle("avatar")} icon="🧑‍🎤" />
        <RailButton label={night ? "House lights up" : "After hours"} onClick={toggleNight} icon={night ? "💡" : "🌙"} />
      </div>

      <div className="absolute bottom-3 left-3 flex items-center gap-2 pointer-events-auto">
        <nav className="panel flex items-center gap-1 rounded-full px-2 py-1 text-xs">
          <Link className="rounded-full px-3 py-1.5 hover:bg-white/10" href="/app/directory">Exhibitors</Link>
          <Link className="rounded-full px-3 py-1.5 hover:bg-white/10" href="/app/rankings">Rankings</Link>
          <Link className="rounded-full px-3 py-1.5 hover:bg-white/10" href="/app/arcade">Arcade</Link>
          <Link className="rounded-full px-3 py-1.5 hover:bg-white/10" href="/app/how-it-works">How it works</Link>
          {me && <Link className="rounded-full px-3 py-1.5 text-amber-300 hover:bg-white/10" href="/app/dashboard">Dashboard</Link>}
        </nav>
        {me && <button onClick={() => setPanel("arcade")} className="panel rounded-full px-3 py-1.5 text-xs mono"><span className="text-amber-300">●</span> {me.coins} coins</button>}
      </div>

      {mode === "walk" && nearBooth && panel === "none" && (
        <button onClick={() => useHall.getState().select(nearBooth.id)} className="pointer-events-auto absolute bottom-24 left-1/2 -translate-x-1/2 panel flex items-center gap-3 rounded-full px-4 py-2 text-sm fade-up">
          <img src={`/api/logo/${nearBooth.id}`} alt="" className="h-7 w-7 rounded-md object-cover" />
          <span><b>{nearBooth.name}</b> · booth {boothSpace(nearBooth.id)?.label}</span>
          <span className="mono rounded-md bg-white/10 px-1.5 text-[11px]">E</span>
        </button>
      )}
      {mode === "walk" && <Joystick />}
      {toast && <div className="absolute bottom-16 left-1/2 -translate-x-1/2 panel rounded-full px-4 py-2 text-sm fade-up">{toast}</div>}
      {!loaded && <div className="absolute inset-0 flex items-center justify-center bg-[var(--bg)]/70 text-sm text-slate-300">Opening the hall…</div>}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 hidden md:block text-[10px] text-slate-400/80 mono">{mode === "walk" ? "arrows / WASD walk · drag the mouse to look · shift run · E open booth · V first person · click a banner to visit the site" : "drag to orbit · scroll to zoom · WASD/arrows to pan · click a booth · 🚶 to walk the floor"}</div>
    </div>
  );
}

/** Touch joystick for walk mode; writes straight into the shared input state. */
function Joystick() {
  const pad = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const active = useRef(false);
  const move = (e: React.PointerEvent) => {
    if (!active.current || !pad.current) return;
    const r = pad.current.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2), dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    const len = Math.hypot(dx, dy) || 1;
    const x = Math.abs(dx) > 1 || Math.abs(dy) > 1 ? dx / len : dx, y = Math.abs(dx) > 1 || Math.abs(dy) > 1 ? dy / len : dy;
    input.joy.x = x; input.joy.y = y; setKnob({ x, y });
  };
  const end = () => { active.current = false; input.joy.x = 0; input.joy.y = 0; setKnob({ x: 0, y: 0 }); };
  return (
    <div className="pointer-events-auto absolute bottom-20 right-24 md:hidden">
      <div ref={pad} className="relative h-28 w-28 rounded-full border border-white/20 bg-white/10 backdrop-blur" onPointerDown={(e) => { active.current = true; (e.target as HTMLElement).setPointerCapture(e.pointerId); move(e); }} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
        <div className="absolute left-1/2 top-1/2 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full bg-amber-300/80" style={{ transform: `translate(calc(-50% + ${knob.x * 36}px), calc(-50% + ${knob.y * 36}px))` }} />
      </div>
      <button className="mt-2 w-full panel rounded-full py-1 text-xs" onPointerDown={() => { input.run = true; }} onPointerUp={() => { input.run = false; }}>run</button>
    </div>
  );
}

function FeaturedStrip() {
  const featured = useHall((s) => s.featured);
  const select = useHall((s) => s.select);
  const setFlyTo = useHall((s) => s.setFlyTo);
  if (!featured.length) return null;
  return (
    <div className="pointer-events-auto hidden items-center gap-1 rounded-full panel px-2 py-1 md:flex">
      <span className="px-2 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300">Headliners</span>
      {featured.slice(0, 5).map((f) => (
        <button key={f.id} onClick={() => { select(f.id); setFlyTo(f.id); }} title={f.reason === "winner" ? "This week's trending winner" : "Headliner"} className="flex items-center gap-1.5 rounded-full px-2 py-1 text-xs hover:bg-white/10">
          <img src={`/api/logo/${f.id}`} alt="" className="h-5 w-5 rounded-md object-cover" />
          <span className="max-w-[120px] truncate">{f.name}</span>
          <span>{f.reason === "winner" ? "🏆" : "★"}</span>
        </button>
      ))}
      <Link href="/app/seasons" className="px-2 text-[11px] text-slate-400 hover:text-white">seasons →</Link>
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
  const events = useHall((s) => s.events);
  const booths = useHall((s) => s.booths);
  const select = useHall((s) => s.select);
  const setFlyTo = useHall((s) => s.setFlyTo);
  const [open, setOpen] = useState(true);
  const top = Array.from(booths.values()).sort((a, b) => b.valueCents - a.valueCents).slice(0, 6);
  return (
    <div className="pointer-events-auto panel rounded-2xl p-3 max-h-[calc(100vh-170px)] overflow-y-auto scroll">
      <div className="flex items-center justify-between">
        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">Top booths</div>
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
                  <span className="block truncate text-[11px] text-slate-400">Booth {p.label} · {formatCount(p.totalViews)} visits · {p.views7d ?? 0} this week</span>
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
            <button onClick={() => e.boothId && (select(e.boothId), setFlyTo(e.boothId))} className="flex w-full items-start gap-2 rounded-lg px-2 py-1 text-left hover:bg-white/5">
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
