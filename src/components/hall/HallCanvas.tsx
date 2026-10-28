"use client";
import { Suspense, useEffect } from "react";
import { live, applyRoster, type LivePlayer } from "@/lib/hall/live";
import { social, showBubble, bumpSocial } from "@/lib/hall/social";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { Scene } from "./Scene";
import { useHall, api, type HallBooth, type HallEvent, type HallStats, type Me, type HallBillboard, type Featured } from "@/lib/hall/store";
import type { LiveMessage } from "@/lib/realtime";

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
      if (d.user?.awardedToday) setToast(`+${d.user.awardedToday} coins for showing up today · ${d.user.streak}-day streak`);
    });
    // The stream is registered under the visitor cookie it saw. If a parallel request handed out a different cookie
    // first, private messages would miss this tab, so reconnect once the real id is known from the presence reply.
    let es = new EventSource("/api/live");
    let sseId = "";
    const onMessage = (ev: MessageEvent) => {
      const m = JSON.parse(ev.data) as LiveMessage;
      if (m.type === "hello") { sseId = m.id; social.dm.me = social.dm.me || m.id; return; }
      if (m.type === "event") pushEvent(m.event);
      else if (m.type === "booth") upsertBooth({ ...m.booth });
      else if (m.type === "presence") setStats({ online: Math.max(1, m.online) });
      else if (m.type === "players") applyRoster(m.players as LivePlayer[]);
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
        if (!mine) { showBubble(msg.from, msg.body, 6000); if (!(d.active && d.active.id === other && useHall.getState().panel === "dm")) setToast(`💬 ${msg.fromName}: ${msg.body.slice(0, 80)}`); }
        bumpSocial();
      }
      else if (m.type === "stats") setStats({ totalSalesCents: m.totalSalesCents, totalViews: m.totalViews, claimed: m.claimed });
    };
    es.onmessage = onMessage;
    const check = setInterval(() => {
      if (live.me && sseId && live.me !== sseId) { es.close(); sseId = ""; es = new EventSource("/api/live"); es.onmessage = onMessage; }
    }, 2000);
    return () => {
      alive = false;
      clearInterval(check);
      es.close();
    };
  }, [setBooths, upsertBooth, pushEvent, setStats, setMe, setBillboards, setFeatured, setToast]);

  // ACES on the renderer covers the low tier (no composer); the composer applies the same curve in its own pass.
  return (
    <Canvas
      style={{ touchAction: "none" }}
      shadows="percentage"
      dpr={[1, 1.25]}
      camera={{ position: [0, 150, 180], fov: 45, near: 0.5, far: 2200 }}
      gl={{ antialias: false, powerPreference: "high-performance", stencil: false, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.12 }}
      onPointerMissed={() => { if (useHall.getState().mode === "map") useHall.getState().select(null); }}
      className="h-full w-full"
    >
      <Suspense fallback={null}>
        <Scene />
      </Suspense>
    </Canvas>
  );
}
