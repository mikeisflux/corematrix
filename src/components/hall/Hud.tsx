"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- links out of the hall are full page loads on purpose: a client-side
   navigation makes React dismantle the 3D scene object by object before the next page can show */
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
import { SettingsPanel } from "./panels/SettingsPanel";
import { ConBotPanel } from "./panels/ConBotPanel";
import { EmotesPanel } from "./panels/EmotesPanel";
import { TeamsPanel } from "./panels/TeamsPanel";
import { requestSit } from "@/lib/hall/seats";
import { PeoplePanel } from "./panels/PeoplePanel";
import { DmPanel } from "./panels/DmPanel";
import { useSocial } from "@/lib/hall/social";
import { PerfOverlay } from "./PerfOverlay";
import { useTheater, setTheaterSound } from "@/lib/hall/theater";
import { Minimap } from "./Minimap";
import { usePrefs, toggleFirstPerson } from "@/lib/hall/prefs";
import { Tips } from "./Tips";
import { SignupNudge } from "./SignupNudge";

export function Hud() {
  const stats = useHall((s) => s.stats);
  const panel = useHall((s) => s.panel);
  const setPanel = useHall((s) => s.setPanel);
  const night = useHall((s) => s.night);
  const toggleNight = useHall((s) => s.toggleNight);
  const firstPerson = usePrefs().firstPerson;
  const me = useHall((s) => s.me);
  const toast = useHall((s) => s.toast);
  const setToast = useHall((s) => s.setToast);
  const events = useHall((s) => s.events);
  const loaded = useHall((s) => s.loaded);
  const mode = useHall((s) => s.mode);
  const setMode = useHall((s) => s.setMode);
  const near = useHall((s) => s.near);
  const nearBot = useHall((s) => s.nearBot);
  const nearSeat = useHall((s) => s.nearSeat);
  const nearSeatOk = useHall((s) => s.nearSeatOk);
  const toastAction = useHall((s) => s.toastAction);
  const seated = useHall((s) => s.seated);
  const th = useTheater();
  const soc = useSocial();
  const booths = useHall((s) => s.booths);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 5000); return () => clearTimeout(t); }, [toast, setToast]);
  const latest = events[0];
  const nearBooth = near ? booths.get(near) : null;
  const toggle = (p: typeof panel) => setPanel(panel === p ? "none" : p);
  // phones get the panels as a bottom sheet outside the animated column (an animated ancestor would pin a fixed sheet to it)
  const [mobile, setMobile] = useState(false);
  useEffect(() => { const mq = window.matchMedia("(max-width: 767px)"); const on = () => setMobile(mq.matches); on(); mq.addEventListener("change", on); return () => mq.removeEventListener("change", on); }, []);
  const panelBody = panel === "none" ? null : (
    <>
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
      {panel === "settings" && <SettingsPanel />}
      {panel === "conbot" && <ConBotPanel />}
      {panel === "emotes" && <EmotesPanel />}
      {panel === "people" && <PeoplePanel />}
      {panel === "teams" && <TeamsPanel />}
      {panel === "dm" && <DmPanel />}
    </>
  );

  return (
    <div className="pointer-events-none absolute inset-0 select-none">
      <PerfOverlay />
      {loaded && <Minimap />}
      {loaded && <Tips />}
      {loaded && <SignupNudge />}
      <div className="absolute left-2 top-2 flex flex-col items-start gap-2 fade-up md:left-1/2 md:top-3 md:-translate-x-1/2 md:items-center">
        <button onClick={() => toggle("stats")} className="pointer-events-auto panel flex items-center gap-2 rounded-full px-3 py-1.5 text-xs hover:border-white/20 md:gap-4 md:px-4 md:py-2 md:text-sm">
          <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />{stats?.online ?? 1} on the floor</span>
          {(stats?.walking ?? 0) > 0 && <><span className="text-slate-400">|</span><span title="Real people walking the hall right now; they wear a green triangle">👣 {stats?.walking} walking</span></>}
          <span className="hidden text-slate-400 sm:inline">|</span>
          <span className="hidden sm:inline">👁 {formatCount(stats?.totalViews ?? 0)} visits</span>
          <span className="hidden text-slate-400 sm:inline">|</span>
          <span className="hidden sm:inline">{stats?.claimed ?? 0}/{stats?.totalBooths ?? 0} booths</span>
        </button>
        <div className="hidden md:block"><FeaturedStrip /></div>
      </div>

      {panelBody && mobile && (
        <div className="pointer-events-auto panel fixed inset-x-2 bottom-2 z-30 max-h-[58vh] overflow-y-auto scroll rounded-2xl">{panelBody}</div>
      )}
      <div className="absolute left-3 top-3 flex w-[360px] max-w-[calc(100vw-24px)] flex-col gap-2 fade-up">
        <div className="pointer-events-auto panel hidden items-center justify-between rounded-2xl px-4 py-3 md:flex">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">{SITE_NAME} · total sales</div>
            <div className="mono text-xl font-bold text-amber-300">{formatMoney(stats?.totalSalesCents ?? 0)}</div>
          </div>
          <button onClick={() => setPanel("claim")} className="btn-primary">Get a booth from $5</button>
        </div>
        {latest && (
          <button onClick={() => latest.boothId && useHall.getState().select(latest.boothId)} className="pointer-events-auto panel hidden items-center gap-2 rounded-xl px-3 py-2 text-left text-xs md:flex">
            <span className="h-2 w-2 shrink-0 rounded-full bg-amber-300 animate-pulse" />
            <span className="truncate"><b>{latest.title}</b>{latest.detail ? ` · ${latest.detail}` : ""}</span>
            <span className="ml-auto shrink-0 text-slate-400 mono">{timeAgo(latest.createdAt)}</span>
          </button>
        )}
        {panelBody && !mobile && (
          <div className="pointer-events-auto panel max-h-[calc(100vh-210px)] overflow-y-auto scroll rounded-2xl fade-up">{panelBody}</div>
        )}
        {panel === "none" && loaded && mode === "map" && <LiveFeed />}
      </div>

      <div className="absolute right-2 top-2 flex gap-1 panel rounded-2xl p-1 pointer-events-auto md:hidden">
        <RailButton label="People & messages" active={panel === "people" || panel === "dm"} onClick={() => toggle("people")} icon="👥" badge={soc.dm.unread} />
        <RailButton label="Hall chat" active={panel === "chat"} onClick={() => toggle("chat")} icon="💬" />
        <RailButton label={me ? "Account" : "Sign in"} active={panel === "me"} onClick={() => toggle("me")} icon={me ? "👤" : "➜"} badge={me?.unread} />
      </div>
      <div className="absolute right-3 top-3 hidden flex-col gap-1 panel rounded-2xl p-1 fade-up pointer-events-auto md:flex">
        <RailButton label="Rankings" active={panel === "rankings"} onClick={() => toggle("rankings")} icon="🏆" />
        <RailButton label="Search" active={panel === "search"} onClick={() => toggle("search")} icon="🔍" />
        <RailButton label="Hall chat" active={panel === "chat"} onClick={() => toggle("chat")} icon="💬" />
        <RailButton label="People & messages" active={panel === "people" || panel === "dm"} onClick={() => toggle("people")} icon="👥" badge={soc.dm.unread} />
        <RailButton label="Arcade" active={panel === "arcade"} onClick={() => toggle("arcade")} icon="🕹️" />
        <RailButton label="Hanging banners" active={panel === "billboards"} onClick={() => toggle("billboards")} icon="🪧" />
        <RailButton label="Teams" active={panel === "teams"} onClick={() => toggle("teams")} icon="🎟️" />
        <RailButton label={me ? "Account" : "Sign in"} active={panel === "me"} onClick={() => toggle("me")} icon={me ? "👤" : "➜"} badge={me?.unread} />
      </div>

      {/* mode switch + lights: bottom right on a desktop; on a phone bottom left, leaving the right thumb the stick */}
      <div className="absolute bottom-3 left-3 flex flex-col gap-1 panel rounded-2xl p-1 pointer-events-auto md:left-auto md:right-3">
        <RailButton label={mode === "walk" ? "Back to the map" : "Walk the floor"} active={mode === "walk"} onClick={() => { if (mode === "walk") setMode("map"); else { setMode("walk"); setPanel("none"); } }} icon={mode === "walk" ? "🗺️" : "🚶"} />
        {mode === "walk" && <RailButton label={firstPerson ? "Third person view (V)" : "First person view (V)"} active={firstPerson} onClick={toggleFirstPerson} icon={firstPerson ? "🧍" : "👁️"} />}
        <RailButton label="Your avatar" active={panel === "avatar"} onClick={() => toggle("avatar")} icon="🧑‍🎤" />
        <RailButton label="Emotes" active={panel === "emotes"} onClick={() => toggle("emotes")} icon="🙌" />
        <RailButton label={night ? "House lights up" : "After hours"} onClick={toggleNight} icon={night ? "💡" : "🌙"} />
        <RailButton label="Settings" active={panel === "settings"} onClick={() => toggle("settings")} icon="⚙️" />
      </div>

      <div className="absolute bottom-3 left-3 hidden items-center gap-2 pointer-events-auto md:flex">
        {/* plain links, not <Link>: leaving the hall client-side makes React dismantle the whole 3D scene object by object
            before the next page shows (19 s vs 9 s in a software-rendered test); a real page load just drops it */}
        <nav className="panel flex items-center gap-1 rounded-full px-2 py-1 text-xs">
          <a className="rounded-full px-3 py-1.5 hover:bg-white/10" href="/app/directory">Exhibitors</a>
          <a className="rounded-full px-3 py-1.5 hover:bg-white/10" href="/app/rankings">Rankings</a>
          <a className="rounded-full px-3 py-1.5 hover:bg-white/10" href="/app/arcade">Arcade</a>
          <a className="rounded-full px-3 py-1.5 hover:bg-white/10" href="/app/how-it-works">How it works</a>
          {me && <a className="rounded-full px-3 py-1.5 text-amber-300 hover:bg-white/10" href="/app/dashboard">Dashboard</a>}
        </nav>
        {me && <button onClick={() => setPanel("arcade")} className="panel rounded-full px-3 py-1.5 text-xs mono"><span className="text-amber-300">●</span> {me.coins} coins</button>}
      </div>

      {mode === "walk" && nearBooth && panel === "none" && (
        <button onClick={() => useHall.getState().select(nearBooth.id)} className="pointer-events-auto absolute bottom-[19rem] left-1/2 -translate-x-1/2 panel flex items-center gap-3 rounded-full px-4 py-2 text-sm fade-up md:bottom-24">
          <img src={`/api/logo/${nearBooth.id}`} alt="" className="h-7 w-7 rounded-md object-cover" />
          <span><b>{nearBooth.name}</b> · booth {boothSpace(nearBooth.id)?.label}</span>
          <span className="mono rounded-md bg-white/10 px-1.5 text-[11px]">E</span>
        </button>
      )}
      {/* on a phone the prompts below sit 13rem higher than on a desktop: the stick (bottom right) and the menu
          (bottom left) fill the bottom of the screen, and a prompt over the stick blocks walking away from it */}
      {mode === "walk" && <Joystick />}
      {mode === "walk" && th.near && th.playing && panel === "none" && (
        <button onClick={() => setTheaterSound(!th.sound)} className="pointer-events-auto absolute bottom-[22rem] left-1/2 -translate-x-1/2 md:bottom-36 panel flex items-center gap-3 rounded-full px-4 py-2 text-sm fade-up">
          <span className="text-lg">🎬</span>
          <span><b>{th.title || "Now showing"}</b></span>
          <span className={`rounded-md px-1.5 text-[11px] ${th.sound ? "bg-emerald-400/20 text-emerald-200" : "bg-white/10"}`}>{th.sound ? "🔊 sound on · off when you leave the arcade" : "🔇 tap here or click the screen for sound"}</span>
        </button>
      )}
      {mode === "walk" && panel === "none" && (seated || nearSeat) && (
        <button onClick={() => requestSit(seated ? "stand" : nearSeat!)} className="pointer-events-auto absolute bottom-[19rem] left-1/2 -translate-x-1/2 panel flex items-center gap-3 rounded-full px-4 py-2 text-sm fade-up md:bottom-24" style={{ marginBottom: nearBooth || nearBot ? 52 : 0 }}>
          <span className="text-lg">🪑</span>
          <span>{seated ? <><b>Seated</b> · tap or move to stand up</> : nearSeatOk ? <><b>{nearSeat!.booth != null ? "Sit at your table" : "Take a seat"}</b>{nearSeat!.booth == null ? " · theater bench" : ""}</> : <><b>Crew only</b> · {me ? "ask the exhibitor to add you to their team" : "sign in if you're on the crew"}</>}</span>
          {(seated || nearSeatOk) && <span className="mono rounded-md bg-white/10 px-1.5 text-[11px]">C</span>}
        </button>
      )}
      {mode === "walk" && !nearBooth && nearBot && panel === "none" && (
        <button onClick={() => setPanel("conbot")} className="pointer-events-auto absolute bottom-[19rem] left-1/2 -translate-x-1/2 panel flex items-center gap-3 rounded-full px-4 py-2 text-sm fade-up md:bottom-24">
          <span className="text-lg">🤖</span>
          <span><b>ConBot</b> wants to say hi</span>
          <span className="mono rounded-md bg-white/10 px-1.5 text-[11px]">E</span>
        </button>
      )}
      {toast && (toastAction
        ? <button onClick={() => { const a = toastAction; setToast(null); a(); }} className="pointer-events-auto absolute bottom-[17rem] left-1/2 -translate-x-1/2 md:bottom-16 panel rounded-full px-4 py-2 text-sm fade-up hover:bg-white/10">{toast} <span className="text-[11px] text-amber-300">· open</span></button>
        : <div className="absolute bottom-[17rem] left-1/2 -translate-x-1/2 md:bottom-16 panel rounded-full px-4 py-2 text-sm fade-up">{toast}</div>)}
      {!loaded && <div className="absolute inset-0 flex items-center justify-center bg-[var(--bg)]/70 text-sm text-slate-300">Opening the hall…</div>}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 hidden md:block text-[10px] text-slate-400/80 mono">{mode === "walk" ? "arrows / WASD walk · drag the mouse to look · shift run · E open booth · C sit · V first person · click a banner to visit the site" : "drag to orbit · scroll to zoom · WASD/arrows to pan · click a booth · 🚶 to walk the floor"}</div>
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
    const x = len > 1 ? dx / len : dx, y = len > 1 ? dy / len : dy;
    input.joy.x = x; input.joy.y = y; input.run = len > 0.92; // push to the rim to run
    setKnob({ x, y });
  };
  const end = () => { active.current = false; input.joy.x = 0; input.joy.y = 0; input.run = false; setKnob({ x: 0, y: 0 }); };
  // leaving walk mode with a thumb still on the stick must not leave the avatar walking on its own next time
  useEffect(() => () => { input.joy.x = 0; input.joy.y = 0; input.run = false; }, []);
  return (
    <div className="pointer-events-auto absolute bottom-24 right-5 md:hidden" style={{ touchAction: "none" }}>
      <div ref={pad} className="relative h-32 w-32 rounded-full border border-white/20 bg-white/10" onPointerDown={(e) => { active.current = true; (e.target as HTMLElement).setPointerCapture(e.pointerId); move(e); }} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
        <div className="absolute left-1/2 top-1/2 h-14 w-14 rounded-full bg-amber-300/80" style={{ transform: `translate(calc(-50% + ${knob.x * 40}px), calc(-50% + ${knob.y * 40}px))` }} />
      </div>
      <div className="mt-1 text-center text-[10px] text-slate-400">push to the edge to run<br />drag the view to look</div>
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
      <a href="/app/seasons" className="px-2 text-[11px] text-slate-400 hover:text-white">seasons →</a>
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
