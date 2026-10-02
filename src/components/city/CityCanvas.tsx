"use client";
import { Suspense, useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { Scene } from "./Scene";
import { useCity, api, type CityPlot, type CityEvent, type CityStats, type Me, type CityBillboard } from "@/lib/city/store";
import type { LiveMessage } from "@/lib/realtime";

export function CityCanvas() {
  const setPlots = useCity((s) => s.setPlots);
  const upsertPlot = useCity((s) => s.upsertPlot);
  const pushEvent = useCity((s) => s.pushEvent);
  const setStats = useCity((s) => s.setStats);
  const setMe = useCity((s) => s.setMe);
  const setBillboards = useCity((s) => s.setBillboards);
  const setToast = useCity((s) => s.setToast);

  useEffect(() => {
    let alive = true;
    api<{ plots: CityPlot[]; stats: CityStats; events: CityEvent[]; billboards: CityBillboard[] }>("/api/city").then((d) => {
      if (!alive) return;
      setPlots(d.plots);
      setStats(d.stats);
      d.events
        .slice()
        .reverse()
        .forEach((e) => pushEvent(e));
      setBillboards(d.billboards);
    });
    api<{ user: Me | null; plots: Array<{ id: number; name: string | null; valueCents: number; tier: string; color: string }> }>("/api/me").then((d) => {
      if (!alive) return;
      setMe(d.user, d.plots);
      if (d.user?.awardedToday) setToast(`+${d.user.awardedToday} coins for showing up today · ${d.user.streak}-day streak`);
    });
    const es = new EventSource("/api/live");
    es.onmessage = (ev) => {
      const m = JSON.parse(ev.data) as LiveMessage;
      if (m.type === "event") pushEvent(m.event);
      else if (m.type === "plot") upsertPlot({ ...m.plot });
      else if (m.type === "presence") setStats({ online: Math.max(1, m.online) });
      else if (m.type === "stats") setStats({ totalSalesCents: m.totalSalesCents, totalViews: m.totalViews, claimed: m.claimed });
    };
    return () => {
      alive = false;
      es.close();
    };
  }, [setPlots, upsertPlot, pushEvent, setStats, setMe, setBillboards, setToast]);

  return (
    <Canvas
      shadows
      dpr={[1, 1.75]}
      camera={{ position: [-40, 95, 150], fov: 40, near: 0.5, far: 1400 }}
      gl={{ antialias: true, powerPreference: "high-performance" }}
      onPointerMissed={() => useCity.getState().select(null)}
      className="h-full w-full"
    >
      <Suspense fallback={null}>
        <Scene />
      </Suspense>
    </Canvas>
  );
}
