"use client";
import { Suspense, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
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
    const es = new EventSource("/api/live");
    es.onmessage = (ev) => {
      const m = JSON.parse(ev.data) as LiveMessage;
      if (m.type === "event") pushEvent(m.event);
      else if (m.type === "booth") upsertBooth({ ...m.booth });
      else if (m.type === "presence") setStats({ online: Math.max(1, m.online) });
      else if (m.type === "stats") setStats({ totalSalesCents: m.totalSalesCents, totalViews: m.totalViews, claimed: m.claimed });
    };
    return () => {
      alive = false;
      es.close();
    };
  }, [setBooths, upsertBooth, pushEvent, setStats, setMe, setBillboards, setFeatured, setToast]);

  return (
    <Canvas
      shadows
      dpr={[1, 1.25]}
      camera={{ position: [0, 150, 180], fov: 45, near: 0.5, far: 2200 }}
      gl={{ antialias: false, powerPreference: "high-performance" }}
      onPointerMissed={() => { if (useHall.getState().mode === "map") useHall.getState().select(null); }}
      className="h-full w-full"
    >
      <Suspense fallback={null}>
        <Scene />
      </Suspense>
    </Canvas>
  );
}
