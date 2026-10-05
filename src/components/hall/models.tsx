"use client";
/**
 * GLB loading for the hall. Models live in public/models (see LICENSES.md) and
 * are listed in manifest.json; anything missing from the manifest falls back
 * to the procedural primitives, so the scene never breaks on a missing file.
 */
import { Suspense, useEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { create } from "zustand";
import type { AvatarConfig } from "@/lib/hall/store";
import { HAIR_NODES } from "@/lib/hall/modelkit/avatar";

interface Manifest { models: Record<string, { file: string }> }
const useManifest = create<{ loaded: boolean; models: Record<string, string>; load: () => void }>((set, get) => ({
  loaded: false, models: {},
  load: () => {
    if (get().loaded || typeof window === "undefined") return;
    set({ loaded: true });
    fetch("/models/manifest.json").then((r) => (r.ok ? r.json() : { models: {} })).then((m: Manifest) => { set({ models: Object.fromEntries(Object.entries(m.models ?? {}).map(([k, v]) => [k, v.file])) }); for (const f of Object.values(m.models ?? {})) useGLTF.preload(f.file); }).catch(() => null);
  },
}));
export function modelUrl(name: string): string | null { const s = useManifest.getState(); if (!s.loaded) s.load(); return s.models[name] ?? null; }
export function useModelUrl(name: string): string | null { const load = useManifest((s) => s.load); const url = useManifest((s) => s.models[name]); useEffect(() => load(), [load]); return url ?? null; }

/** Deep-clone a loaded scene with per-instance materials so recoloring one booth doesn't recolor them all. */
function cloneWithMaterials(scene: THREE.Object3D, colors?: Record<string, string>, emissive?: Record<string, string>): THREE.Object3D {
  const c = scene.clone(true);
  c.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const src = m.material as THREE.MeshStandardMaterial;
    const name = src.name;
    if ((colors && colors[name]) || (emissive && emissive[name])) {
      const mm = src.clone();
      if (colors?.[name]) mm.color.set(colors[name]);
      if (emissive?.[name]) { mm.emissive.set(emissive[name]); }
      m.material = mm;
    }
  });
  return c;
}

interface PropProps { name: string; colors?: Record<string, string>; emissive?: Record<string, string>; maps?: Record<string, THREE.Texture>; position?: [number, number, number]; rotation?: [number, number, number]; scale?: number | [number, number, number]; fallback?: ReactNode; onClick?: (e: { stopPropagation: () => void }) => void }
/** A GLB prop by manifest name, or the fallback primitives when the model isn't available. */
export function Prop(p: PropProps) {
  const url = useModelUrl(p.name);
  if (!url) return <group position={p.position} rotation={p.rotation} scale={p.scale}>{p.fallback}</group>;
  return (
    <Suspense fallback={<group position={p.position} rotation={p.rotation} scale={p.scale}>{p.fallback}</group>}>
      <GltfProp {...p} url={url} />
    </Suspense>
  );
}
function GltfProp({ url, colors, emissive, maps, position, rotation, scale, onClick }: PropProps & { url: string }) {
  const { scene } = useGLTF(url);
  const colorKey = JSON.stringify([colors, emissive]);
  const obj = useMemo(() => {
    const c = cloneWithMaterials(scene, colors, emissive);
    if (maps) c.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && maps[(m.material as THREE.Material).name]) { const mm = (m.material as THREE.MeshStandardMaterial).clone(); mm.map = maps[(m.material as THREE.Material).name]; mm.color.set("#ffffff"); mm.transparent = true; mm.alphaTest = 0.02; m.material = mm; } });
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, colorKey, maps]);
  return <primitive object={obj} position={position} rotation={rotation} scale={scale} onClick={onClick} />;
}

/** Shared per-avatar motion state: 0 idle, 1 walk, 2 run. Written every frame by the mover, never via React. */
export interface Motion { speed: number }
const HAIR_SET = new Set<string>(HAIR_NODES);

/** The rigged GLB avatar with idle/walk/run crossfades and recoloring by material name. */
export function AvatarRig({ config, motion, url }: { config: AvatarConfig; motion: Motion; url: string }) {
  const { scene, animations } = useGLTF(url);
  const colorKey = `${config.skin}|${config.hairColor}|${config.shirt}|${config.pants}|${config.hair}`;
  const obj = useMemo(() => {
    const c = cloneWithMaterials(scene, { skin: config.skin, hair: config.hairColor, shirt: config.shirt, pants: config.pants });
    c.traverse((o) => { if (HAIR_SET.has(o.name)) o.visible = o.name === `hair_${config.hair}`; });
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, colorKey]);
  const ref = useRef<THREE.Object3D>(null);
  const mixer = useMemo(() => new THREE.AnimationMixer(obj), [obj]);
  const actions = useMemo(() => Object.fromEntries(animations.map((c) => [c.name, mixer.clipAction(c)])) as Record<string, THREE.AnimationAction>, [animations, mixer]);
  const current = useRef<string>("");
  const frame = useRef(0);
  useEffect(() => () => { mixer.stopAllAction(); }, [mixer]);
  useFrame(({ camera }, dt) => {
    const o = ref.current; if (!o) return;
    // skip hidden or distant figures entirely: no mixer update, no bone transforms
    if (!o.visible || (o.parent && !o.parent.visible)) return;
    const p = o.parent ?? o;
    const dist = Math.hypot(camera.position.x - p.position.x, camera.position.z - p.position.z);
    if (dist > 220) return;
    frame.current++;
    if (dist > 90 && frame.current % 2) return; // far figures animate at half rate
    const want = motion.speed >= 2 ? "run" : motion.speed >= 1 ? "walk" : "idle";
    if (want !== current.current) {
      const next = actions[want]; const prev = actions[current.current];
      if (next) { next.reset().setEffectiveWeight(1).fadeIn(0.18).play(); if (prev) prev.fadeOut(0.18); current.current = want; }
    }
    mixer.update(dist > 90 ? dt * 2 : dt);
  });
  return <primitive ref={ref} object={obj} />;
}
