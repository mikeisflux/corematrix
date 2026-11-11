"use client";
/**
 * GLB loading for the hall. Models live in public/models (see LICENSES.md) and
 * are listed in manifest.json; anything missing from the manifest falls back
 * to the procedural primitives, so the scene never breaks on a missing file.
 */
import { installFullBodyFetch } from "@/lib/full-body-fetch";
import { Suspense, useEffect, useMemo, useRef, type ReactNode, Component } from "react";
import * as THREE from "three";
import { useFrame, useLoader } from "@react-three/fiber";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";
import { MeshoptDecoder } from "@/lib/hall/meshopt-decoder";
import type { AvatarConfig } from "@/lib/hall/store";
import { applyAvatarLook, RECOLOR_MATERIALS } from "@/lib/hall/modelkit/avatar";

import manifest from "../../../public/models/manifest.json";

/** name → file, baked in at build time: the hall used to fetch manifest.json first and only then ask for the models. */
// the size is in the URL so a regenerated model (new avatar parts, say) gets past the day-long cache on the old one
const MODELS: Record<string, string> = Object.fromEntries(Object.entries(manifest.models as Record<string, { file: string; bytes?: number }>).map(([k, v]) => [k, `${v.file}?v=${v.bytes ?? 0}`]));
export function modelUrl(name: string): string | null { return MODELS[name] ?? null; }
export function useModelUrl(name: string): string | null { return MODELS[name] ?? null; }
/**
 * Every GLB goes through this: the avatars and the mascot are meshopt-compressed (scripts/compress-models.mjs), so the
 * loader carries the decoder. three's own GLTFLoader rather than drei's useGLTF: that one imports a decoder that
 * instantiates its WebAssembly inline the moment the bundle loads (see lib/hall/meshopt-decoder.ts).
 */
const withDecoder = (loader: GLTFLoader) => { loader.setMeshoptDecoder(MeshoptDecoder); };
export function useModel(url: string) { return useLoader(GLTFLoader, url, withDecoder); }
// start every download the moment this module is evaluated, well before the scene mounts and asks; the fetch guard
// goes in first so a 206 forced by a download manager does not sink the whole model set
installFullBodyFetch();
if (typeof window !== "undefined") for (const url of Object.values(MODELS)) useLoader.preload(GLTFLoader, url, withDecoder);

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

interface PropProps { name: string; colors?: Record<string, string>; emissive?: Record<string, string>; maps?: Record<string, THREE.Texture>; hide?: string[]; // meshes with these material names are not shown (a table's empty stands)
 position?: [number, number, number]; rotation?: [number, number, number]; scale?: number | [number, number, number]; fallback?: ReactNode; onClick?: (e: { stopPropagation: () => void }) => void }
/** A GLB prop by manifest name, or the fallback primitives when the model isn't available. */
export function Prop(p: PropProps) {
  const url = useModelUrl(p.name);
  if (!url) return <group position={p.position} rotation={p.rotation} scale={p.scale}>{p.fallback}</group>;
  const fb = <group position={p.position} rotation={p.rotation} scale={p.scale}>{p.fallback}</group>;
  return (
    <ModelBoundary fallback={fb}>
      <Suspense fallback={fb}>
        <GltfProp {...p} url={url} />
      </Suspense>
    </ModelBoundary>
  );
}

/** A model that fails to load (a 404, a dropped connection) falls back to its primitives instead of taking the hall down. */
export class ModelBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err: unknown) { console.warn("[models] falling back to primitives:", err); }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
function GltfProp({ url, colors, emissive, maps, hide, position, rotation, scale, onClick }: PropProps & { url: string }) {
  const { scene } = useModel(url);
  const colorKey = JSON.stringify([colors, emissive]);
  // keyed on the textures themselves: callers pass a fresh `maps` object every render, which re-cloned the model on every hover
  const mapKey = maps ? Object.entries(maps).map(([k, t]) => `${k}:${t?.uuid ?? ""}`).join("|") : "";
  const hideKey = hide?.join("|") ?? "";
  const obj = useMemo(() => {
    const c = cloneWithMaterials(scene, colors, emissive);
    if (hide?.length) c.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && hide.includes((m.material as THREE.Material).name)) m.visible = false; });
    if (maps) c.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && maps[(m.material as THREE.Material).name]) { const mm = (m.material as THREE.MeshStandardMaterial).clone(); mm.map = maps[(m.material as THREE.Material).name]; mm.color.set("#ffffff"); mm.transparent = true; mm.alphaTest = 0.02; m.material = mm; } });
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, colorKey, mapKey, hideKey]);
  return <primitive object={obj} position={position} rotation={rotation} scale={scale} onClick={onClick} />;
}

/** Shared per-avatar motion state: 0 idle, 1 walk, 2 run. Written every frame by the mover, never via React. */
/** What a figure is doing: speed drives idle/walk/run; an emote (name + the moment it was triggered) plays once on top, unless the figure is moving. */
export interface Motion { speed: number; ftps?: number; emote?: { name: string; at: number } | null; sit?: boolean } // ftps: real ground speed, to pace the clips

/** The rigged GLB avatar with idle/walk/run crossfades and recoloring by material name. */
export const ONESHOT = new Set(["wave", "dance", "cheer", "clap", "bow", "point", "laugh", "facepalm"]);
const LOCOMOTION = ["idle", "stroll", "walk", "run"];
/** idle/walk/run from speed, or the emote while it lasts (moving cancels it). Shared by the GLB rig and the primitive fallback. */
export function wantedClip(motion: Motion, actions: Record<string, THREE.AnimationAction | undefined>, st: { at: number; until: number; name: string }): string {
  if (motion.sit && actions.sit) { st.until = 0; return "sit"; }
  const em = motion.emote;
  // own keys only: an emote named "constructor" would pass a plain lookup and throw every frame
  if (em && em.at !== st.at && Object.hasOwn(actions, em.name) && actions[em.name]) { st.at = em.at; st.name = em.name; st.until = performance.now() + (actions[em.name]!.getClip().duration - 0.15) * 1000; }
  if (motion.speed >= 1) st.until = 0;
  if (st.until > performance.now()) return st.name;
  return motion.speed >= 2 ? "run" : motion.speed >= 1 ? "walk" : "idle";
}
/**
 * Drives a figure's mixer from its motion state. The locomotion clips run all the time with weights from the
 * eased speed (a blend tree), so a figure easing from a stroll into a run passes through a real mix of the two cycles
 * instead of a hard crossfade; the sit pose or an emote plays over them and scales them down while it lasts. Hidden
 * or distant figures cost nothing; far ones step at half rate. `extra` runs after each mixer step (a VRM's physics).
 */
/**
 * How fast each body's stroll, walk and run cycles cover ground as captured (feet per second): a real easy stroll,
 * a brisk walk and a jog, the shorter body's steps a little shorter. scripts/avatars/retarget.mjs prints these when
 * it writes the clips.
 */
export interface ClipPace { stroll: number; walk: number; run: number }
export const CLIP_PACE: Record<"a" | "b", ClipPace> = { a: { stroll: 3.91, walk: 6.0, run: 11.98 }, b: { stroll: 3.49, walk: 5.34, run: 10.68 } };
/** How fast people move on the floor (feet per second): a brisk walk and a run. */
export const WALK_FTPS = 6, RUN_FTPS = 13;

export function useFigureAnimation(mixer: THREE.AnimationMixer, actions: Record<string, THREE.AnimationAction | undefined>, motion: Motion, ref: React.RefObject<THREE.Object3D | null>, pace: ClipPace, extra?: (dt: number, camera: THREE.Camera) => void) {
  const overlay = useRef<THREE.AnimationAction | null>(null); // the sit pose or an emote, played over the locomotion blend
  const blend = useRef(0); // eased speed, 0 idle → 1 walk → 2 run
  const frame = useRef(0);
  const emote = useRef({ at: 0, until: 0, name: "" });
  useEffect(() => {
    for (const n of LOCOMOTION) actions[n]?.setEffectiveWeight(n === "idle" ? 1 : 0).play();
    blend.current = 0; overlay.current = null;
    return () => { mixer.stopAllAction(); };
  }, [mixer, actions]);
  useFrame(({ camera }, dt) => {
    const o = ref.current; if (!o) return;
    // skip hidden or distant figures entirely: no mixer update, no bone transforms
    if (!o.visible || (o.parent && !o.parent.visible)) return;
    const p = o.parent ?? o;
    const dist = Math.hypot(camera.position.x - p.position.x, camera.position.z - p.position.z);
    if (dist > 220) return;
    frame.current++;
    if (dist > 90 && frame.current % 2) return; // far figures animate at half rate
    const step = dist > 90 ? dt * 2 : dt;
    const want = wantedClip(motion, actions, emote.current);
    const ov = LOCOMOTION.includes(want) ? null : actions[want] ?? null;
    if (ov !== overlay.current) {
      if (overlay.current) overlay.current.fadeOut(0.18);
      if (ov) { ov.reset().setLoop(ONESHOT.has(want) ? THREE.LoopOnce : THREE.LoopRepeat, Infinity).setEffectiveWeight(1).fadeIn(0.18).play(); ov.clampWhenFinished = ONESHOT.has(want); }
      overlay.current = ov;
    }
    const target = Math.min(2, Math.max(0, motion.speed));
    blend.current += (target - blend.current) * Math.min(1, step * 7);
    const b = blend.current, k = 1 - (overlay.current ? overlay.current.getEffectiveWeight() : 0);
    actions.idle?.setEffectiveWeight(Math.max(0, 1 - b) * k);
    actions.run?.setEffectiveWeight(Math.max(0, b - 1) * k);
    // the clips cover ground at their own natural pace; played at the figure's real speed the feet stop sliding
    const ftps = motion.ftps ?? (b <= 1 ? b * WALK_FTPS : WALK_FTPS + (b - 1) * (RUN_FTPS - WALK_FTPS));
    const walking = (b <= 1 ? b : Math.max(0, 2 - b)) * k;
    const stroll = actions.stroll, walk = actions.walk;
    if (stroll && walk) {
      // Walking is a mix of two captured gaits by how fast the figure goes: an easy stroll (short, slow steps) and a
      // brisk walk. Both are played at the same stride period, the one at which the mixed stride covers the ground
      // the figure does, so the two stay in step with each other and with the floor.
      const mix = Math.min(1, Math.max(0, (ftps - pace.stroll) / (pace.walk - pace.stroll)));
      const ds = stroll.getClip().duration, dw = walk.getClip().duration;
      const stride = (1 - mix) * pace.stroll * ds + mix * pace.walk * dw; // feet per stride of the mix
      const period = Math.min(ds / 0.55, Math.max(dw / 1.8, stride / Math.max(0.1, ftps)));
      stroll.setEffectiveWeight(walking * (1 - mix)); walk.setEffectiveWeight(walking * mix);
      stroll.timeScale = ds / period; walk.timeScale = dw / period;
    } else if (walk) { walk.setEffectiveWeight(walking); walk.timeScale = Math.min(2.2, Math.max(0.5, ftps / pace.walk)); }
    if (actions.run) actions.run.timeScale = Math.min(2, Math.max(0.6, ftps / pace.run));
    mixer.update(step);
    extra?.(step, camera);
  });
}

export function AvatarRig({ config, motion, url }: { config: AvatarConfig; motion: Motion; url: string }) {
  const { scene, animations } = useModel(url);
  const colorKey = `${config.skin}|${config.hairColor}|${config.shirt}|${config.pants}|${config.hair}|${config.costume ?? "none"}`;
  const obj = useMemo(() => {
    const c = SkeletonUtils.clone(scene); // a skinned body: its bones must be cloned with it and the meshes rebound to the copies
    const colors = applyAvatarLook(c, config);
    c.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      if (m.name === "lod") { m.visible = false; return; } // the far-crowd stand-in baked into the file; CrowdImpostors draws it
      const name = (m.material as THREE.Material).name;
      if ((RECOLOR_MATERIALS as readonly string[]).includes(name)) { const mm = (m.material as THREE.MeshStandardMaterial).clone(); mm.color.set(colors[name]); if (name === "costume2") mm.emissive.set(colors[name]).multiplyScalar(0.25); if (name === "glow") { mm.emissive.set(colors[name]); mm.emissiveIntensity = 1.5; } m.material = mm; }
    });
    return c;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, colorKey]);
  const ref = useRef<THREE.Object3D>(null);
  const mixer = useMemo(() => new THREE.AnimationMixer(obj), [obj]);
  const actions = useMemo(() => Object.fromEntries(animations.map((c) => [c.name, mixer.clipAction(c)])) as Record<string, THREE.AnimationAction>, [animations, mixer]);
  useFigureAnimation(mixer, actions, motion, ref, CLIP_PACE[config.body]);
  return <primitive ref={ref} object={obj} />;
}
