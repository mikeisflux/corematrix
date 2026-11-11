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
import { requestSit } from "@/lib/hall/seats";
import { useSocial } from "@/lib/hall/social";
import { PerfOverlay } from "./PerfOverlay";
import { ArtPreview } from "./ArtPreview";
import { PortfolioBook } from "./PortfolioBook";
import { ChatDock } from "./ChatDock";
import { useTheater, setTheaterSound, setTheaterOpen } from "@/lib/hall/theater";
import { useAgent, talkToAgent, answerAgent, AGENT_REPLIES } from "@/lib/hall/agent";
import { Minimap } from "./Minimap";
import { usePrefs, toggleFirstPerson } from "@/lib/hall/prefs";
import { Tips } from "./Tips";
import { SignupNudge } from "./SignupNudge";
import { useQuests, startQuestTracking } from "@/lib/hall/quests";
import { startDwellTracking } from "@/lib/hall/dwell";
import { useShop, refreshShop, sponsorsAt, claimSponsor } from "@/lib/hall/shop";
import { itemById } from "@/lib/hall/items";
import { useTours } from "@/lib/hall/tours";
import { TourBar } from "./TourBar";
import { TheaterOverlay } from "./TheaterOverlay";
import { useVoice, startVoiceTracking } from "@/lib/hall/voice";
import { VoiceHud } from "./VoiceHud";

import dynamic from "next/dynamic";

/**
 * Panels are separate chunks: the hall's own download carries none of them. Each loads on first open, and once the
 * floor is up they are all fetched in the background, so by the time anyone clicks, the chunk is already here.
 */
const PANEL_LOADERS = {
  booth: () => import("./panels/BoothPanel").then((m) => m.BoothPanel),
  rankings: () => import("./panels/RankingsPanel").then((m) => m.RankingsPanel),
  search: () => import("./panels/SearchPanel").then((m) => m.SearchPanel),
  chat: () => import("./panels/ChatPanel").then((m) => m.ChatPanel),
  stats: () => import("./panels/StatsPanel").then((m) => m.StatsPanel),
  arcade: () => import("./panels/ArcadePanel").then((m) => m.ArcadePanel),
  billboards: () => import("./panels/BillboardsPanel").then((m) => m.BillboardsPanel),
  me: () => import("./panels/MePanel").then((m) => m.MePanel),
  claim: () => import("./panels/ClaimPanel").then((m) => m.ClaimPanel),
  avatar: () => import("./panels/AvatarPanel").then((m) => m.AvatarPanel),
  settings: () => import("./panels/SettingsPanel").then((m) => m.SettingsPanel),
  conbot: () => import("./panels/ConBotPanel").then((m) => m.ConBotPanel),
  emotes: () => import("./panels/EmotesPanel").then((m) => m.EmotesPanel),
  teams: () => import("./panels/TeamsPanel").then((m) => m.TeamsPanel),
  people: () => import("./panels/PeoplePanel").then((m) => m.PeoplePanel),
  dm: () => import("./panels/DmPanel").then((m) => m.DmPanel),
  quests: () => import("./panels/QuestsPanel").then((m) => m.QuestsPanel),
  shop: () => import("./panels/ShopPanel").then((m) => m.ShopPanel),
  help: () => import("./panels/HelpPanel").then((m) => m.HelpPanel),
  tours: () => import("./panels/ToursPanel").then((m) => m.ToursPanel),
  player: () => import("./panels/PlayerPanel").then((m) => m.PlayerPanel),
};
type PanelKey = keyof typeof PANEL_LOADERS;
/**
 * A tab opened before a deploy asks for panel chunks that no longer exist on the server. Rather than a dead panel, retry
 * once (a network blip), and if the chunk is really gone, reload the page onto the new build, at most once every two
 * minutes so a persistent failure can't loop.
 */
function withRecovery<T>(load: () => Promise<T>): () => Promise<T> {
  return async () => {
    try { return await load(); } catch { /* retry below */ }
    try { return await load(); } catch (e) {
      const err = e as Error;
      const gone = err?.name === "ChunkLoadError" || /chunk|dynamically imported module|import\(\)/i.test(String(err?.message ?? e));
      let last = 0; try { last = Number(sessionStorage.getItem("fcc_chunk_reload") || 0); } catch { /* storage off */ }
      if (gone && Date.now() - last > 120_000) {
        try { sessionStorage.setItem("fcc_chunk_reload", String(Date.now())); } catch { /* storage off */ }
        location.reload();
        await new Promise<never>(() => {}); // the page is going away
      }
      throw e;
    }
  };
}
const Panels = Object.fromEntries((Object.entries(PANEL_LOADERS) as Array<[PanelKey, () => Promise<React.ComponentType>]>).map(([k, load]) => [k, dynamic(withRecovery(load), { ssr: false, loading: () => <div className="p-4 text-xs text-slate-400">Loading…</div> })])) as Record<PanelKey, React.ComponentType>;
export function prefetchPanels() { for (const load of Object.values(PANEL_LOADERS)) void load().catch(() => {}); }

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
  // warm the panel chunks once the floor is drawn and the browser has a quiet moment
  useEffect(() => {
    if (!loaded) return;
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    if (w.requestIdleCallback) { const id = w.requestIdleCallback(prefetchPanels, { timeout: 8000 }); return () => w.cancelIdleCallback?.(id); }
    const t = setTimeout(prefetchPanels, 3000); return () => clearTimeout(t);
  }, [loaded]);
  // daily quests: the board loads with the hall, theater time is reported from here, and the rail badge shows what's ready to collect
  useEffect(() => { if (loaded) return startQuestTracking(); }, [loaded]);
  useEffect(() => { if (loaded) return startDwellTracking(); }, [loaded]);
  // the shop: what booths are giving away (for the walk-up prompt) and what the player owns
  useEffect(() => { if (loaded) void refreshShop(); }, [loaded, me]);
  useShop();
  // proximity voice: opens the mic (muted, push-to-talk) when walking with the Settings toggle on, releases it on the map
  useEffect(() => { if (loaded) return startVoiceTracking(); }, [loaded]);
  const voiceOn = useVoice().enabled;
  const questBoard = useQuests();
  const claimable = questBoard?.claimable ?? 0;
  const touring = useTours().active; // the tour bar takes the bottom-centre spot; the booth and ConBot prompts yield to it
  const mode = useHall((s) => s.mode);
  const setMode = useHall((s) => s.setMode);
  const near = useHall((s) => s.near);
  const nearBot = useHall((s) => s.nearBot);
  const ag = useAgent();
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
  // the chat box at the bottom left pushes the minimap, the panel column and the live feed up by its height (computers only)
  const dock = usePrefs().chatDock;
  const dockH = dock === "off" || panel === "chat" || panel === "dm" ? "0px" : dock === "min" ? "2.1rem" : "13.6rem";
  const Panel = panel !== "none" && Object.hasOwn(Panels, panel) ? Panels[panel as PanelKey] : null;
  const panelBody = Panel ? <Panel /> : null;

  return (
    <div className="pointer-events-none absolute inset-0 select-none" style={{ "--fcc-dock": mobile ? "0px" : dockH } as React.CSSProperties}>
      <PerfOverlay />
      {loaded && <ChatDock />}
      {loaded && <ArtPreview />}
      {loaded && <PortfolioBook />}
      {loaded && <WaitingRoom />}
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
          <div className="pointer-events-auto panel max-h-[calc(100vh-210px-var(--fcc-dock))] overflow-y-auto scroll rounded-2xl fade-up">{panelBody}</div>
        )}
        {panel === "none" && loaded && mode === "map" && <LiveFeed />}
      </div>

      <div className="absolute right-2 top-2 flex gap-1 panel rounded-2xl p-1 pointer-events-auto md:hidden">
        <RailButton label="People & messages" active={panel === "people" || panel === "dm"} onClick={() => toggle("people")} icon="👥" badge={soc.dm.unread} />
        <RailButton label="Hall chat" active={panel === "chat"} onClick={() => toggle("chat")} icon="💬" />
        <RailButton label="Daily quests" active={panel === "quests"} onClick={() => toggle("quests")} icon="📜" badge={claimable} />
        <RailButton label="Shop" active={panel === "shop"} onClick={() => toggle("shop")} icon="🛍️" />
        <RailButton label="Guided tours" active={panel === "tours"} onClick={() => toggle("tours")} icon="🧭" />
        <RailButton label={me ? "Account" : "Sign in"} active={panel === "me"} onClick={() => toggle("me")} icon={me ? "👤" : "➜"} badge={me?.unread} />
      </div>
      <div className="absolute right-3 top-3 hidden flex-col gap-1 panel rounded-2xl p-1 fade-up pointer-events-auto md:flex">
        <RailButton label="Rankings" active={panel === "rankings"} onClick={() => toggle("rankings")} icon="🏆" />
        <RailButton label="Search" active={panel === "search"} onClick={() => toggle("search")} icon="🔍" />
        <RailButton label="Hall chat" active={panel === "chat"} onClick={() => toggle("chat")} icon="💬" />
        <RailButton label="People & messages" active={panel === "people" || panel === "dm"} onClick={() => toggle("people")} icon="👥" badge={soc.dm.unread} />
        <RailButton label="Arcade" active={panel === "arcade"} onClick={() => toggle("arcade")} icon="🕹️" />
        <RailButton label="Daily quests" active={panel === "quests"} onClick={() => toggle("quests")} icon="📜" badge={claimable} />
        <RailButton label="Shop" active={panel === "shop"} onClick={() => toggle("shop")} icon="🛍️" />
        <RailButton label="Guided tours" active={panel === "tours"} onClick={() => toggle("tours")} icon="🧭" />
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
        <RailButton label="Help" active={panel === "help"} onClick={() => toggle("help")} icon="❓" />
      </div>

      <div className="absolute bottom-3 left-3 hidden items-center gap-2 pointer-events-auto md:flex">
        {/* plain links, not <Link>: leaving the hall client-side makes React dismantle the whole 3D scene object by object
            before the next page shows (19 s vs 9 s in a software-rendered test); a real page load just drops it */}
        <nav className="panel flex items-center gap-1 rounded-full px-2 py-1 text-xs">
          <a className="rounded-full px-3 py-1.5 hover:bg-white/10" href="/app/directory">Exhibitors</a>
          <a className="rounded-full px-3 py-1.5 hover:bg-white/10" href="/app/rankings">Rankings</a>
          <a className="rounded-full px-3 py-1.5 hover:bg-white/10" href="/app/arcade">Arcade</a>
          <a className="rounded-full px-3 py-1.5 hover:bg-white/10" href="/help">Help</a>
          {me && <a className="rounded-full px-3 py-1.5 text-amber-300 hover:bg-white/10" href="/app/dashboard">Dashboard</a>}
        </nav>
        {me && <button onClick={() => setPanel("arcade")} className="panel rounded-full px-3 py-1.5 text-xs mono"><span className="text-amber-300">●</span> {me.coins} coins</button>}
      </div>

      {mode === "walk" && nearBooth && panel === "none" && !touring && sponsorsAt(nearBooth.id).slice(0, 1).map((sp) => { const it = itemById(sp.itemId); return it && (
        <button key={sp.id} onClick={() => { if (!me) { setPanel("me"); return; } claimSponsor(sp.id).then((r) => { setToast(`🎁 ${r.item.name} from ${r.boothName ?? nearBooth.name} is yours`, () => setPanel("avatar")); if (r.item.costume) useHall.getState().setAvatar({ costume: r.item.costume }); }).catch((e: Error) => setToast(e.message)); }} className="pointer-events-auto absolute bottom-[22rem] left-1/2 -translate-x-1/2 md:bottom-36 panel flex items-center gap-3 rounded-full border-emerald-400/40 px-4 py-2 text-sm fade-up">
          <span className="text-lg">🎁</span>
          <span><b>Free {it.name}</b> from {nearBooth.name} · {me ? "tap to claim" : "sign in to claim"}</span>
        </button>); })}
      {touring && panel === "none" && <TourBar />}
      {mode === "walk" && nearBooth && panel === "none" && !touring && (
        <button onClick={() => useHall.getState().select(nearBooth.id)} className="pointer-events-auto absolute bottom-[19rem] left-1/2 -translate-x-1/2 panel flex items-center gap-3 rounded-full px-4 py-2 text-sm fade-up md:bottom-24">
          <img src={`/api/logo/${nearBooth.id}`} alt="" className="h-7 w-7 rounded-md object-cover" />
          <span><b>{nearBooth.name}</b> · {nearBooth.kind === "artist" && Object.keys(nearBooth.art ?? {}).some((k) => k.startsWith("gallery:")) ? "🎨 see the portfolio" : `booth ${boothSpace(nearBooth.id)?.label}`}</span>
          <span className="mono rounded-md bg-white/10 px-1.5 text-[11px]">E</span>
        </button>
      )}
      {/* on a phone the prompts below sit 13rem higher than on a desktop: the stick (bottom right) and the menu
          (bottom left) fill the bottom of the screen, and a prompt over the stick blocks walking away from it */}
      {mode === "walk" && <Joystick />}
      {mode === "walk" && loaded && <VoiceHud />}
      {mode === "walk" && th.near && th.playing && panel === "none" && !th.open && (
        <div className="pointer-events-auto absolute bottom-[22rem] left-1/2 -translate-x-1/2 md:bottom-36 panel flex items-center gap-2 rounded-full py-1.5 pl-4 pr-1.5 text-sm fade-up">
          <button onClick={() => setTheaterSound(!th.sound)} className="flex items-center gap-3">
            <span className="text-lg">🎬</span>
            <span><b>{th.title || "Now showing"}</b></span>
            <span className={`rounded-md px-1.5 text-[11px] ${th.sound ? "bg-emerald-400/20 text-emerald-200" : "bg-white/10"}`}>{th.sound ? "🔊 sound on · off when you leave the arcade" : "🔇 tap here or click the screen for sound"}</span>
          </button>
          <button data-theater-full onClick={() => setTheaterOpen(true)} className="rounded-full bg-amber-300 px-3 py-1 text-xs font-semibold text-slate-950 hover:bg-amber-200" title="Watch full screen, with the showtimes">⛶ Full screen</button>
        </div>
      )}
      {th.open && <TheaterOverlay />}
      {mode === "walk" && panel === "none" && (seated || nearSeat) && (
        <button onClick={() => requestSit(seated ? "stand" : nearSeat!)} className="pointer-events-auto absolute bottom-[19rem] left-1/2 -translate-x-1/2 panel flex items-center gap-3 rounded-full px-4 py-2 text-sm fade-up md:bottom-24" style={{ marginBottom: touring ? 92 : nearBooth || nearBot ? 52 : 0 }}>
          <span className="text-lg">🪑</span>
          <span>{seated ? <><b>Seated</b> · tap or move to stand up</> : nearSeatOk ? <><b>{nearSeat!.booth != null ? "Sit at your table" : "Take a seat"}</b>{nearSeat!.booth == null ? " · theater bench" : ""}</> : <><b>Crew only</b> · {me ? "ask the exhibitor to add you to their team" : "sign in if you're on the crew"}</>}</span>
          {(seated || nearSeatOk) && <span className="mono rounded-md bg-white/10 px-1.5 text-[11px]">C</span>}
        </button>
      )}
      {mode === "walk" && !nearBooth && !nearBot && ag.near && !ag.talking && panel === "none" && !touring && (
        <button data-agent-prompt onClick={talkToAgent} className="pointer-events-auto absolute bottom-[19rem] left-1/2 -translate-x-1/2 panel flex items-center gap-3 rounded-full px-4 py-2 text-sm fade-up md:bottom-24">
          <span className="text-lg">🕶️</span>
          <span><b>The agent</b> is looking at you</span>
          <span className="mono rounded-md bg-white/10 px-1.5 text-[11px]">E</span>
        </button>
      )}
      {mode === "walk" && ag.talking && panel === "none" && (
        <div data-agent-talk className="pointer-events-auto absolute bottom-[19rem] left-1/2 w-[min(92vw,420px)] -translate-x-1/2 panel rounded-2xl px-4 py-3 text-sm fade-up md:bottom-24">
          <div className="flex items-center gap-2"><span className="text-lg">🕶️</span><span className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">The agent</span></div>
          <p className="mt-1 text-base font-semibold">{ag.line}</p>
          {ag.asked && <div className="mt-2 flex flex-wrap gap-2">{AGENT_REPLIES.map((r, i) => <button key={r.say} className="btn-ghost text-xs" onClick={() => answerAgent(i)}>{r.say}</button>)}</div>}
        </div>
      )}
      {mode === "walk" && !nearBooth && nearBot && panel === "none" && !touring && (
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
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 hidden md:block text-[10px] text-slate-400/80 mono">{mode === "walk" ? `arrows / WASD walk · drag the mouse to look · shift run · E open booth · C sit · V first person${voiceOn ? " · hold T to talk" : ""} · click a banner to visit the site` :"drag to orbit · scroll to zoom · WASD/arrows to pan · click a booth · 🚶 to walk the floor"}</div>
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

/** The hall is full: where you stand in line, the estimate, and what you can do meanwhile. Closes itself when you are in. */
function WaitingRoom() {
  const q = useHall((s) => s.queue);
  const setQueue = useHall((s) => s.setQueue);
  const setMode = useHall((s) => s.setMode);
  if (!q) return null;
  const mins = Math.max(1, Math.round(q.etaSec / 60));
  if (q.admitted) return (
    <div data-waiting-room className="pointer-events-auto absolute inset-x-0 top-24 z-[60] mx-auto w-[min(92vw,420px)] panel rounded-2xl border-emerald-400/40 px-5 py-4 text-sm fade-up">
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-300">You&apos;re in</div>
      <div className="mt-1 text-base font-semibold">A spot opened up. Walking you onto the floor…</div>
    </div>
  );
  return (
    <div data-waiting-room className="pointer-events-auto absolute inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="panel w-[min(92vw,460px)] rounded-2xl px-6 py-5 text-sm fade-up">
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300">The hall is full</div>
        <h2 className="mt-1 text-xl font-bold">You&apos;re in line to walk the floor</h2>
        <p className="mt-2 text-slate-300">{q.capacity} people are walking right now, the most the floor takes at once. You are <b className="text-white">number {q.position}</b> in line{q.ahead > 0 ? `, ${q.ahead} ahead of you` : ""}. The line moves as people leave; we&apos;ll walk you in the moment a spot opens. Estimated wait: about <b className="text-white">{mins} minute{mins === 1 ? "" : "s"}</b>.</p>
        <p className="mt-2 text-xs text-slate-400">Keep this tab open to hold your place. Meanwhile the map, every booth, the chat and the theater are open: click any booth on the map to visit it.</p>
        <div className="mt-4 flex items-center gap-2">
          <button onClick={() => { setQueue(null); setMode("map"); }} className="btn-primary">Browse the map while I wait</button>
          <span className="text-[11px] text-slate-500">The waiting room comes back when a spot opens.</span>
        </div>
      </div>
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
    <div className="pointer-events-auto panel rounded-2xl p-3 max-h-[calc(100vh-205px-var(--fcc-dock))] overflow-y-auto scroll">
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
