"use client";
import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Environment, PerformanceMonitor } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette, SMAA, BrightnessContrast, HueSaturation, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { Booth } from "./Booth";
import { Hall } from "./Hall";
import { EmptyBooths } from "./EmptyBooths";
import { Arcade, flyoverCurve } from "./Arcade";
import { Player, Crowd, Others } from "./Avatar";
import { Mascot } from "./Mascot";
import { TwoSided } from "./Booth";
import { signTexture } from "./textures";
import { useHall, track, guessQuality, type HallBooth, type Quality } from "@/lib/hall/store";
import { usePrefs } from "@/lib/hall/prefs";
import { PerfCapture } from "./PerfCapture";
import { boothSpace, boothPosition, CEILING, HALLS, HALL_LENGTH, X0, Z_CROSS0, Z_CROSS1, Z0 } from "@/lib/hall/layout";

export function Scene() {
  const booths = useHall((s) => s.booths);
  const night = useHall((s) => s.night);
  const hovered = useHall((s) => s.hovered);
  const selected = useHall((s) => s.selected);
  const billboards = useHall((s) => s.billboards);
  const mode = useHall((s) => s.mode);
  const quality = useHall((s) => s.quality);
  const setQuality = useHall((s) => s.setQuality);
  const list = useMemo(() => Array.from(booths.values()), [booths]);
  const { setDpr } = useThree();
  const prefs = usePrefs();
  // a locked tier (gear menu) wins over the frame-rate monitor
  useEffect(() => { setQuality(prefs.quality === "auto" ? guessQuality() : prefs.quality); }, [setQuality, prefs.quality]);
  useEffect(() => { setDpr(quality === "high" ? Math.min(1.5, window.devicePixelRatio) : quality === "medium" ? Math.min(1.25, window.devicePixelRatio) : 1); }, [quality, setDpr]);
  const crowdScale = prefs.crowd === "none" ? 0 : prefs.crowd === "light" ? 0.4 : 1;
  const crowd = { high: [110, 140], medium: [60, 80], low: [28, 40] }[quality].map((n) => Math.round(n * crowdScale));
  return (
    <>
      {prefs.quality === "auto" && (
        <PerformanceMonitor
          bounds={() => (prefs.fpsCap === 30 ? [20, 29] : [40, 58])}  // a capped hall never exceeds the cap; judge it against that
          flipflops={3}
          onDecline={() => setQuality(step(quality, -1))}
          onIncline={() => setQuality(step(quality, 1))}
        />
      )}
      <PerfCapture />
      <Lighting night={night} />
      <Hall night={night} />
      <Arcade night={night} />
      <EmptyBooths claimed={booths} night={night} />
      {list.map((p) => <Booth key={p.id} booth={p} night={night} hovered={hovered === p.id} selected={selected === p.id} />)}
      <PreviewBooth />
      <AisleBanners billboards={billboards} night={night} />
      <EntranceBanner billboards={billboards} night={night} />
      <Crowd count={mode === "walk" ? crowd[1] : crowd[0]} />
      <Mascot />
      <Player />
      <Others />
      <CameraRig />
      <Impressions />
      {quality !== "low" && (
        <EffectComposer multisampling={0}>
          {quality === "high" ? <SMAA /> : <></>}
          {/* Bloom reads the HDR buffer before tone mapping: by day only emissives past 1.2 glow (fixtures, neon, signage), never the lit floor;
              by night the threshold drops so every marquee and tube washes its surroundings. */}
          <Bloom intensity={night ? 1.3 : 0.5} luminanceThreshold={night ? 0.5 : 1.2} luminanceSmoothing={night ? 0.45 : 0.12} mipmapBlur radius={night ? 0.8 : 0.55} levels={night ? 7 : 5} />
          {/* The composer renders to a float buffer where three skips material tone mapping, so the filmic curve is applied here, fused into the same pass. */}
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
          <BrightnessContrast brightness={night ? -0.015 : 0.01} contrast={night ? 0.16 : 0.1} />
          <HueSaturation saturation={night ? 0.22 : 0.16} />
          <Vignette eskil={false} offset={night ? 0.15 : 0.28} darkness={night ? 0.8 : 0.45} />
        </EffectComposer>
      )}
    </>
  );
}

const ORDER: Quality[] = ["low", "medium", "high"];
function step(q: Quality, d: number): Quality { return ORDER[Math.max(0, Math.min(ORDER.length - 1, ORDER.indexOf(q) + d))]; }

/**
 * Show-floor lighting. Day is a fluorescent hall: cool-white hemisphere, a warm key from high front-right that casts the
 * one shadow map, a cool fill from the opposite side and a white rim from the back wall. Night keeps the same rig dimmed
 * and cooled, with a magenta rim so the neon seems to wash the whole floor. Exposure is set on the renderer here so the
 * low tier (no composer) and the composer's ACES pass agree.
 */
const KEY_OFFSET = { x: 90, y: 170, z: 70 };
function Lighting({ night }: { night: boolean }) {
  const quality = useHall((s) => s.quality);
  const gl = useThree((s) => s.gl);
  const key = useRef<THREE.DirectionalLight>(null);
  const anchor = useMemo(() => new THREE.Object3D(), []);
  const dir = useMemo(() => new THREE.Vector3(), []);
  const shadows = quality !== "low";
  useEffect(() => { gl.toneMappingExposure = night ? 1.05 : 1.0; }, [gl, night]);
  useEffect(() => {
    // the shadow camera's bounds are set as props below; its projection has to be rebuilt once they land
    const l = key.current; if (!l) return;
    const c = l.shadow.camera;
    c.left = -160; c.right = 160; c.top = 160; c.bottom = -160; c.near = 10; c.far = 520;
    c.updateProjectionMatrix();
    l.shadow.needsUpdate = true;
  }, [shadows]);
  useFrame(({ camera }) => {
    const l = key.current; if (!l) return;
    // the 320 ft shadow box follows the floor point the camera looks at, snapped to a grid so shadows don't shimmer while panning
    camera.getWorldDirection(dir);
    const reach = dir.y < -0.02 ? Math.min(600, -camera.position.y / dir.y) : 120;
    const px = Math.round((camera.position.x + dir.x * reach) / 8) * 8;
    const pz = Math.round((camera.position.z + dir.z * reach) / 8) * 8;
    anchor.position.set(px, 0, pz); anchor.updateMatrixWorld();
    l.position.set(px + KEY_OFFSET.x, KEY_OFFSET.y, pz + KEY_OFFSET.z);
  });
  return (
    <>
      {/* own boundary: the hall, models and manifest no longer wait behind the 1.6 MB HDR */}
      <Suspense fallback={null}><Environment files="/hdri/warehouse.hdr" environmentIntensity={night ? 0.14 : 0.5} /></Suspense>
      <ambientLight intensity={night ? 0.2 : 0.1} color={night ? "#4a4f99" : "#ffffff"} />
      <hemisphereLight intensity={night ? 0.4 : 0.65} color={night ? "#444a94" : "#f3f6ff"} groundColor={night ? "#0a0b14" : "#4b5060"} />
      <directionalLight
        ref={key}
        position={[KEY_OFFSET.x, KEY_OFFSET.y, KEY_OFFSET.z]}
        target={anchor}
        intensity={night ? 0.42 : 1.35}
        color={night ? "#8d93ff" : "#fff3df"}
        castShadow={shadows}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-160}
        shadow-camera-right={160}
        shadow-camera-top={160}
        shadow-camera-bottom={-160}
        shadow-camera-near={10}
        shadow-camera-far={520}
        shadow-bias={-0.0003}
        shadow-normalBias={0.6}
      />
      <primitive object={anchor} />
      <directionalLight position={[-220, 140, -110]} intensity={night ? 0.16 : 0.45} color={night ? "#5b6bff" : "#cfe0ff"} />
      <directionalLight position={[40, 90, -320]} intensity={night ? 0.24 : 0.3} color={night ? "#ff2bd6" : "#ffffff"} />
      <fog attach="fog" args={[night ? "#0c1020" : "#2c3242", night ? 280 : 320, night ? 1350 : 1500]} />
      <color attach="background" args={[night ? "#05060c" : "#1e2230"]} />
    </>
  );
}

/** The live claim preview: renders the draft as a real booth on its space. */
function PreviewBooth() {
  const draft = useHall((s) => s.previewDraft);
  const night = useHall((s) => s.night);
  if (!draft) return null;
  const sp = boothSpace(draft.boothId);
  if (!sp) return null;
  const booth: HallBooth = { id: draft.boothId, name: draft.name || "Your booth", tagline: null, website: null, hasLogo: false, color: draft.color, accent: "#ffffff", style: draft.style, cloth: draft.cloth, bannerHeight: 6, category: "comics", size: sp.size, kind: sp.kind, label: sp.label, hall: sp.hall, tier: "free", valueCents: sp.priceCents, totalViews: 0, totalClicks: 0, claimedAt: null, salesCount: 0 };
  return <Booth booth={booth} night={night} hovered={false} selected={false} preview />;
}

type Ad = { id: string; slot: string; headline: string; body: string | null; color: string; imageUrl: string | null; boothId: number | null };
/** Hanging banners over the cross aisle, one per hall. Sold as "block" billboards. */
function AisleBanners({ billboards, night }: { billboards: Ad[]; night: boolean }) {
  const hallW = HALL_LENGTH / HALLS.length;
  const setPanel = useHall((s) => s.setPanel);
  return (
    <group>
      {HALLS.map((h, i) => {
        const ad = billboards.find((b) => b.slot === `block:${i}`);
        const tex = signTexture(ad ? [ad.headline, ad.body ?? ""] : ["YOUR BANNER HERE", `Hall ${h} cross aisle · $20/week`], { bg: ad?.color ?? "#1f2937", fg: "#fff", w: 1024, h: 256, size: ad ? 80 : 56 });
        return (
          <group key={h} position={[X0 + hallW * (i + 0.5), CEILING - 8, (Z_CROSS0 + Z_CROSS1) / 2]} onClick={(e) => { e.stopPropagation(); if (ad) track({ kind: "billboard", id: ad.id, metric: "opens" }); setPanel("billboards"); }} onPointerOver={() => { document.body.style.cursor = "pointer"; }} onPointerOut={() => { document.body.style.cursor = ""; }}>
            <TwoSided w={40} h={10}><meshStandardMaterial map={tex} emissiveMap={tex} emissive="#fff" emissiveIntensity={night ? 0.6 : 0.1} /></TwoSided>
            {[-18, 18].map((x) => <mesh key={x} position={[x, 6.5, 0]}><cylinderGeometry args={[0.08, 0.08, 5, 4]} /><meshStandardMaterial color="#9ca3af" /></mesh>)}
          </group>
        );
      })}
    </group>
  );
}

/** The giant banner over the main entrance: the premium "airship" slot. */
function EntranceBanner({ billboards, night }: { billboards: Ad[]; night: boolean }) {
  const ad = billboards.find((b) => b.slot === "airship");
  const tex = useMemo(() => signTexture(ad ? [ad.headline, ad.body ?? ""] : ["WELCOME TO FOREVERCOMICCON", "the convention that never closes"], { bg: ad?.color ?? "#111827", fg: "#ffffff", w: 2048, h: 512, size: ad ? 150 : 120 }), [ad]);
  const setPanel = useHall((s) => s.setPanel);
  return (
    <group position={[0, CEILING - 7, Z0 + 14]} onClick={(e) => { e.stopPropagation(); if (ad) track({ kind: "billboard", id: ad.id, metric: "opens" }); setPanel("billboards"); }} onPointerOver={() => { document.body.style.cursor = "pointer"; }} onPointerOut={() => { document.body.style.cursor = ""; }}>
      <mesh><planeGeometry args={[150, 12]} /><meshStandardMaterial map={tex} emissiveMap={tex} emissive="#fff" emissiveIntensity={night ? 0.6 : 0.12} side={THREE.DoubleSide} /></mesh>
      {[-70, -35, 0, 35, 70].map((x) => <mesh key={x} position={[x, 6.5 + (CEILING - (CEILING - 7) - 6) / 2, 0]}><cylinderGeometry args={[0.1, 0.1, 7, 4]} /><meshStandardMaterial color="#9ca3af" /></mesh>)}
    </group>
  );
}

function CameraRig() {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();
  const mode = useHall((s) => s.mode);
  const flyTo = useHall((s) => s.flyTo);
  const setFlyTo = useHall((s) => s.setFlyTo);
  const ride = useHall((s) => s.ride);
  const setRide = useHall((s) => s.setRide);
  const curve = useMemo(() => flyoverCurve(), []);
  const rideT = useRef(0);
  const target = useRef<{ pos: THREE.Vector3; look: THREE.Vector3 } | null>(null);

  useEffect(() => {
    if (flyTo == null) return;
    const p = boothPosition(flyTo);
    const sp = boothSpace(flyTo);
    if (mode === "walk") { useHall.getState().setWalkTarget(flyTo); setFlyTo(null); return; }
    const dist = sp?.size === "20x20" ? 52 : 40;
    target.current = { look: new THREE.Vector3(p.x, 3, p.z), pos: new THREE.Vector3(p.x + (sp?.facing ?? 1) * 10, 30, p.z + dist) };
    setFlyTo(null);
  }, [flyTo, setFlyTo, mode]);
  useEffect(() => { if (ride) rideT.current = 0; }, [ride]);
  const pinned = useRef(false);
  useEffect(() => {
    // leaving walk mode: pull the camera back up over the hall
    if (mode === "map" && controls.current && !pinned.current) {
      const t = controls.current.target.clone();
      target.current = { look: new THREE.Vector3(t.x, 2, t.z), pos: new THREE.Vector3(t.x, 70, t.z + 90) };
    }
    pinned.current = false;
  }, [mode]);
  // ?cam=x,y,z,tx,ty,tz pins the map camera (screenshots, deep links)
  useEffect(() => {
    const c = new URLSearchParams(window.location.search).get("cam")?.split(",").map(Number);
    if (c && c.length === 6 && c.every((n) => Number.isFinite(n))) { pinned.current = true; target.current = { pos: new THREE.Vector3(c[0], c[1], c[2]), look: new THREE.Vector3(c[3], c[4], c[5]) }; }
  }, []);

  useFrame((_, dt) => {
    if (ride) {
      rideT.current += dt / 60;
      if (rideT.current >= 1) { setRide(false); return; }
      const p = curve.getPointAt(rideT.current);
      const ahead = curve.getPointAt((rideT.current + 0.004) % 1);
      camera.position.lerp(p, 0.4);
      camera.lookAt(ahead.x, ahead.y - 3, ahead.z);
      return;
    }
    if (mode === "walk") return;
    if (target.current && controls.current) {
      camera.position.lerp(target.current.pos, Math.min(1, dt * 3));
      controls.current.target.lerp(target.current.look, Math.min(1, dt * 3));
      if (camera.position.distanceTo(target.current.pos) < 0.5) target.current = null;
    }
    controls.current?.update();
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (mode !== "map" || !controls.current || (e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      const step = Math.max(6, camera.position.y * 0.12);
      const dir = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step], a: [-step, 0], d: [step, 0], w: [0, -step], s: [0, step] }[e.key] as [number, number] | undefined;
      if (!dir) return;
      controls.current.target.x += dir[0]; controls.current.target.z += dir[1];
      camera.position.x += dir[0]; camera.position.z += dir[1];
      target.current = null;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [camera, mode]);

  if (mode !== "map") return null;
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enabled={!ride}
      enableDamping
      dampingFactor={0.08}
      minDistance={14}
      maxDistance={900}
      maxPolarAngle={Math.PI / 2.12}
      minPolarAngle={0.15}
      target={[0, 2, Z0 + 60]}
      panSpeed={1.2}
      screenSpacePanning={false}
    />
  );
}

/** Reports which booths were on screen; owners see this as "impressions". */
function Impressions() {
  const { camera } = useThree();
  const booths = useHall((s) => s.booths);
  const seen = useRef(new Set<number>());
  const last = useRef(0);
  const frustum = useMemo(() => new THREE.Frustum(), []);
  const mat = useMemo(() => new THREE.Matrix4(), []);
  useFrame((state) => {
    if (state.clock.elapsedTime - last.current < 4) return;
    last.current = state.clock.elapsedTime;
    mat.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(mat);
    const fresh: number[] = [];
    for (const p of booths.values()) {
      if (seen.current.has(p.id)) continue;
      const pos = boothPosition(p.id);
      const v = new THREE.Vector3(pos.x, 5, pos.z);
      if (frustum.containsPoint(v) && camera.position.distanceTo(v) < 180) { seen.current.add(p.id); fresh.push(p.id); }
    }
    if (fresh.length) track({ kind: "impressions", boothIds: fresh });
  });
  return null;
}
