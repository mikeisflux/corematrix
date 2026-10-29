"use client";
import { Suspense, useEffect, useState } from "react";
import { live, applyRoster, type LivePlayer } from "@/lib/hall/live";
import { social, showBubble, bumpSocial } from "@/lib/hall/social";
import { usePrefs } from "@/lib/hall/prefs";
import { openDm } from "./Avatar";
import { NOTICE_ICON } from "@/lib/hall/notices";
import { perf } from "@/lib/hall/perf";
import { Canvas, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { Scene } from "./Scene";
import { useHall, api, type HallBooth, type HallEvent, type HallStats, type Me, type HallBillboard, type Featured } from "@/lib/hall/store";
import type { LiveMessage } from "@/lib/realtime";

/** Toast once when a friend shows up on the floor (and again if they come back after ten minutes away). */
const friendSeen = new Map<string, number>();
function friendsOnFloor(players: LivePlayer[]) {
  const me = useHall.getState().me; if (!me || social.friendIds.size === 0) return;
  const here = new Set<string>();
  for (const p of players) {
    if (!p.uid || p.uid === me.id || !social.friendIds.has(p.uid)) continue;
    here.add(p.uid);
    const last = friendSeen.get(p.uid) ?? 0;
    if (Date.now() - last > 10 * 60_000) useHall.getState().setToast(`🤝 ${p.n} is on the floor`, () => useHall.getState().setWalkPoint({ x: p.x + 3, z: p.z + 1, face: { x: p.x, z: p.z } }));
    friendSeen.set(p.uid, Date.now());
  }
  for (const [uid, t] of friendSeen) if (!here.has(uid) && Date.now() - t > 30_000) friendSeen.set(uid, t); // away: the timestamp ages, so a return after ten minutes toasts again
}

export function HallCanvas() {
  const setBooths = useHall((s) => s.setBooths);
  const upsertBooth = useHall((s) => s.upsertBooth);
  const pushEvent = useHall((s) => s.pushEvent);
  const setStats = useHall((s) => s.setStats);
  const setMe = useHall((s) => s.setMe);
  const setBillboards = useHall((s) => s.setBillboards);
  const setFeatured = useHall((s) => s.setFeatured);
  const setToast = useHall((s) => s.setToast);

  useEffect(() => {
    let alive = true;
    api<{ booths: HallBooth[]; stats: HallStats; events: HallEvent[]; billboards: HallBillboard[]; featured: Featured[] }>("/api/hall").then((d) => {
      if (!alive) return;
      setBooths(d.booths);
      setStats(d.stats);
      d.events
        .slice()
        .reverse()
        .forEach((e) => pushEvent(e));
      setBillboards(d.billboards);
      setFeatured(d.featured);
    });
    try { const saved = localStorage.getItem("fcc_avatar"); if (saved) useHall.getState().setAvatar(JSON.parse(saved)); } catch {}
    api<{ user: Me | null; booths: Array<{ id: number; name: string | null; valueCents: number; tier: string; color: string }> }>("/api/me").then((d) => {
      if (!alive) return;
      setMe(d.user, d.booths);
      if (d.user?.avatar) useHall.getState().setAvatar(d.user.avatar);
      // who my friends are, so the floor can say when one walks in
      if (d.user) api<{ friends: Array<{ id: string }> }>("/api/friends").then((f) => { social.friendIds = new Set(f.friends.map((x) => x.id)); }).catch(() => {});
      if (d.user?.awardedToday) setToast(`+${d.user.awardedToday} coins for showing up today · ${d.user.streak}-day streak`);
    });
    // The stream is registered under the visitor cookie it saw. If a parallel request handed out a different cookie
    // first, private messages would miss this tab, so reconnect once the real id is known from the presence reply.
    // for debugging in the console and in tests: the live roster and social state
    (window as unknown as { __fcc?: unknown }).__fcc = { live, social, hall: useHall };
    // crews change while people are on the floor: refresh my booths when the tab comes back and every two minutes
    const refreshMe = () => { if (document.hidden || !useHall.getState().me) return; api<{ user: Me | null; booths: Array<{ id: number; name: string | null; valueCents: number; tier: string; color: string }> }>("/api/me").then((d) => { if (alive) setMe(d.user, d.booths); }).catch(() => {}); };
    document.addEventListener("visibilitychange", refreshMe);
    const refresh = setInterval(refreshMe, 120_000);
    let es = new EventSource("/api/live");
    let sseId = "";
    const onMessage = (ev: MessageEvent) => {
      const m = JSON.parse(ev.data) as LiveMessage;
      if (m.type === "hello") { sseId = m.id; social.dm.me = social.dm.me || m.id; return; }
      if (m.type === "event") pushEvent(m.event);
      else if (m.type === "booth") upsertBooth({ ...m.booth });
      else if (m.type === "presence") setStats({ online: Math.max(1, m.online) });
      else if (m.type === "players") { applyRoster(m.players as LivePlayer[]); friendsOnFloor(m.players as LivePlayer[]); }
      else if (m.type === "notice") { const n = m.notice; social.noticeVersion++; bumpSocial(); const me = useHall.getState().me; if (me) useHall.getState().setMe({ ...me, unread: (me.unread ?? 0) + 1 }, useHall.getState().myBooths); setToast(`${NOTICE_ICON[n.type] ?? "🔔"} ${n.title}`, () => useHall.getState().setPanel("me")); }
      else if (m.type === "chat") { if (m.message.playerId) showBubble(m.message.playerId, m.message.body); }
      else if (m.type === "dm") {
        const msg = m.message; const d = social.dm;
        const other = msg.from === d.me ? msg.to : msg.from;
        if (d.active && d.active.id === other) { d.messages = [...d.messages.filter((x) => x.id !== msg.id), msg]; }
        const th = d.threads.find((t) => t.with === other);
        const mine = msg.from === d.me;
        if (th) { th.last = msg; if (!mine) { th.name = msg.fromName; if (!(d.active && d.active.id === other)) th.unread++; } }
        else d.threads.unshift({ with: other, name: mine ? (d.active?.name ?? "Visitor") : msg.fromName, last: msg, unread: mine || (d.active && d.active.id === other) ? 0 : 1 });
        d.threads.sort((a, b) => b.last.createdAt - a.last.createdAt);
        d.unread = d.threads.reduce((a, t) => a + t.unread, 0);
        if (!mine) { showBubble(msg.from, msg.body, 6000); if (!(d.active && d.active.id === other && useHall.getState().panel === "dm")) setToast(`💬 ${msg.fromName}: ${msg.body.slice(0, 80)}`, () => openDm(msg.from, msg.fromName)); }
        bumpSocial();
      }
      else if (m.type === "friend") { setToast(m.kind === "request" ? `🤝 ${m.from.name} sent you a friend request` : `🤝 ${m.from.name} accepted your friend request`, () => useHall.getState().setPanel("people")); social.friendsVersion++; bumpSocial(); if (m.kind === "accepted") social.friendIds.add(m.from.id); }
      else if (m.type === "team") { setToast(`🎟️ ${m.from.name} added you to ${m.name}: you can sit at their booth now`, () => useHall.getState().setPanel("me")); api<{ user: Me | null; booths: Array<{ id: number; name: string | null; valueCents: number; tier: string; color: string }> }>("/api/me").then((d) => setMe(d.user, d.booths)); }
      else if (m.type === "stats") setStats({ totalSalesCents: m.totalSalesCents, totalViews: m.totalViews, claimed: m.claimed });
    };
    es.onmessage = onMessage;
    const check = setInterval(() => {
      if (live.me && sseId && live.me !== sseId) { es.close(); sseId = ""; es = new EventSource("/api/live"); es.onmessage = onMessage; }
    }, 2000);
    return () => {
      alive = false;
      clearInterval(check);
      clearInterval(refresh);
      document.removeEventListener("visibilitychange", refreshMe);
      es.close();
    };
  }, [setBooths, upsertBooth, pushEvent, setStats, setMe, setBillboards, setFeatured, setToast]);

  // Frame cap: the canvas renders on demand and a timer asks for frames at the chosen rate, so the card is never run
  // flat out (an uncapped 160 fps pulls full power and heat for nothing on a 60 Hz screen). 0 = the screen's own rate.
  const prefs = usePrefs();
  const [lost, setLost] = useState(false);
  const onCreated = ({ gl, invalidate }: { gl: THREE.WebGLRenderer; invalidate: () => void }) => {
    const el = gl.domElement;
    el.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      perf.contextLost++;              // the perf capture posts it with the next batch of samples
      setLost(true);
      // the browser restores the context on its own once the driver is back (three re-creates its GL state); we wait and
      // never navigate ourselves, because a reload while the GPU process is still restarting fails outright
    });
    el.addEventListener("webglcontextrestored", () => { setLost(false); invalidate(); });
  };
  // ACES on the renderer covers the low tier (no composer); the composer applies the same curve in its own pass.
  return (
    <>
    {lost && (
      <div className="absolute inset-0 z-50 grid place-items-center bg-slate-950/90 text-center text-sm text-slate-200">
        <div className="max-w-sm px-4">
          <div className="text-lg font-bold">Graphics reset</div>
          <div className="mt-1 text-slate-400">Your graphics driver dropped the 3D view. The hall picks up again by itself when the driver is back, usually within a few seconds. If this keeps happening, use Safe mode in ⚙ Settings.</div>
          <button onClick={() => { const u = new URL(location.href); u.searchParams.set("safe", "1"); location.href = u.toString(); }} className="btn-primary mt-3">Reload in safe mode</button>
        </div>
      </div>
    )}
    <Canvas
      style={{ touchAction: "none" }}
      shadows="percentage"
      frameloop={prefs.fpsCap ? "demand" : "always"}
      onCreated={onCreated}
      dpr={[1, 1.25]}
      camera={{ position: [0, 150, 180], fov: 45, near: 0.5, far: 2200 }}
      gl={{ antialias: false, powerPreference: "high-performance", stencil: false, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.12 }}
      onPointerMissed={() => { if (useHall.getState().mode === "map") useHall.getState().select(null); }}
      className="h-full w-full"
    >
      <FrameTicker cap={prefs.fpsCap} />
      <Suspense fallback={null}>
        <Scene />
      </Suspense>
    </Canvas>
    </>
  );
}

/** Asks for a frame every 1/cap seconds, paced on the screen's own refresh so the cadence is even. */
function FrameTicker({ cap }: { cap: number }) {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (!cap) return;
    const step = 1000 / cap;
    let last = 0, raf = 0;
    const loop = (t: number) => {
      raf = requestAnimationFrame(loop);
      if (t - last < step - 1.5) return;      // 1.5 ms slack so a 60 Hz screen at a 60 cap lands on every vsync
      last = t - ((t - last) % step);
      invalidate();
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [cap, invalidate]);
  return null;
}
