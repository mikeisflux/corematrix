"use client";
import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useAnimations } from "@react-three/drei";
import { ARCADE } from "@/lib/hall/layout";
import { signTexture } from "./textures";
import { useModelUrl } from "./models";
import { useHall, dragged } from "@/lib/hall/store";
import { player } from "./Avatar";
import { conbot, botSay, useConBot, GREETINGS, TRICKS_ALL, pick } from "@/lib/hall/conbot";

/** ConBot: the CC0 RobotExpressive robot on its rounds of the arcade plaza. Waves at passers-by, comes over when you open its panel (E nearby, or click it), answers, emotes, and leads the way. */
export function Mascot() {
  const url = useModelUrl("robot");
  if (!url) return null;
  return <Suspense fallback={null}><Robot url={url} /></Suspense>;
}

const TRICKS = TRICKS_ALL;
/** Brand colours for the robot's materials: magenta shell, pale trim, with a little self-glow so it reads at night. */
const PAINT: Record<string, { color: string; emissive?: string; intensity?: number }> = {
  Main: { color: "#ff3ddb", emissive: "#ff2bd6", intensity: 0.22 },
  Grey: { color: "#e6ebf7" },
  Black: { color: "#0e1220" },
};
let blobTex: THREE.CanvasTexture | null = null;
/** Soft contact shadow so the mascot sits on the carpet instead of floating. */
function shadowBlob(): THREE.CanvasTexture {
  if (blobTex) return blobTex;
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const gr = g.createRadialGradient(64, 64, 8, 64, 64, 64);
  gr.addColorStop(0, "rgba(0,0,0,0.75)"); gr.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  blobTex = new THREE.CanvasTexture(c);
  return blobTex;
}

/** Wraps a line of speech into at most three short rows for the bubble. */
function wrap(text: string, width = 30): string[] {
  const words = text.split(" "); const rows: string[] = []; let cur = "";
  for (const w of words) { if ((cur + " " + w).trim().length > width && cur) { rows.push(cur); cur = w; } else cur = (cur + " " + w).trim(); }
  if (cur) rows.push(cur);
  if (rows.length > 3) { rows.length = 3; rows[2] = rows[2].replace(/\.?$/, "…"); }
  return rows;
}

type Mode = "walk" | "trick" | "approach" | "talk" | "emote" | "lead";
/** ConBot's rounds: a loop inside the cabinet columns and short of the stage and the back row, so it never clips a machine. */
const LOOP = [[-18, -28], [18, -28], [18, 28], [-18, 28]];
const LOOPING = new Set(["Walking", "Running", "Idle", "Dance", "Sitting"]);

function Robot({ url }: { url: string }) {
  const { scene, animations } = useGLTF(url);
  const obj = useMemo(() => {
    // the robot is skinned: a plain clone would leave its skinned parts bound to the original, unanimated skeleton
    const c = cloneSkinned(scene);
    const box = new THREE.Box3().setFromObject(c);
    const h = box.max.y - box.min.y || 1;
    c.scale.setScalar(7 / h); c.position.y = -box.min.y * (7 / h);
    c.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      const src = m.material as THREE.MeshStandardMaterial;
      const paint = PAINT[src.name];
      if (!paint) return;
      const mm = src.clone();
      mm.color.set(paint.color);
      if (paint.emissive) { mm.emissive.set(paint.emissive); mm.emissiveIntensity = paint.intensity ?? 0; }
      mm.roughness = 0.45; mm.metalness = 0.15;
      m.material = mm;
    });
    return c;
  }, [scene]);
  const tag = useMemo(() => signTexture(["CONBOT", "the con mascot · say hi!"], { bg: "#0b0f1a", fg: "#ffd166", accentBar: "#ff2bd6", w: 512, h: 160, size: 60 }), []);
  const blob = useMemo(() => shadowBlob(), []);
  const group = useRef<THREE.Group>(null);
  const inner = useRef<THREE.Object3D>(null);
  const bubble = useRef<THREE.Sprite>(null);
  const { actions } = useAnimations(animations, inner);
  const talking = useHall((s) => s.panel === "conbot");
  const version = useConBot();
  // speech bubble texture follows the current line
  const bubbleTex = useMemo(() => conbot.line ? signTexture(wrap(conbot.line), { bg: "#0b0f1a", fg: "#ffffff", accentBar: "#ff2bd6", w: 768, h: 240, size: 44 }) : null, [version]); // eslint-disable-line react-hooks/exhaustive-deps
  const lastT = useRef(0);
  const state = useRef({
    x: ARCADE.x + LOOP[0][0], z: ARCADE.z + LOOP[0][1], tx: ARCADE.x + LOOP[1][0], tz: ARCADE.z + LOOP[1][1],
    mode: "walk" as Mode, after: "walk" as Mode, until: 0, current: "", seenCmd: 0, nextGreet: 0, nextNag: 0, arrive: "",
  });
  const play = (name: string, loop = LOOPING.has(name)) => {
    const s = state.current; if (s.current === name) return;
    const next = actions[name]; const prev = actions[s.current];
    if (!next) return;
    next.reset().setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity).fadeIn(0.25).play();
    next.clampWhenFinished = !loop;
    if (prev) prev.fadeOut(0.25);
    s.current = name;
  };
  const clipSeconds = (name: string) => actions[name]?.getClip().duration ?? 2.5;
  useEffect(() => { play("Walking"); }, [actions]); // eslint-disable-line react-hooks/exhaustive-deps
  // the panel opening calls the robot over; closing it sends it back to its rounds with a wave
  useEffect(() => {
    const s = state.current;
    if (talking) { if (useHall.getState().mode === "walk") s.mode = "approach"; else { s.mode = "talk"; play("Idle"); } }
    else if (s.mode === "talk" || s.mode === "approach" || s.mode === "emote") { s.mode = "trick"; s.after = "walk"; s.until = lastT.current + clipSeconds("Wave"); play("Wave"); } // the frame clock, as useFrame compares against
  }, [talking]); // eslint-disable-line react-hooks/exhaustive-deps
  const nextCorner = (s: typeof state.current) => {
    const corners = LOOP;
    let best = 0, bd = Infinity;
    corners.forEach(([cx, cz], i) => { const d = Math.hypot(ARCADE.x + cx - s.x, ARCADE.z + cz - s.z); if (d < bd && d > 2) { bd = d; best = i; } });
    s.tx = ARCADE.x + corners[best][0]; s.tz = ARCADE.z + corners[best][1];
  };
  const stepTo = (s: typeof state.current, g: THREE.Group, tx: number, tz: number, dt: number, speed: number) => {
    const dx = tx - s.x, dz = tz - s.z, dist = Math.hypot(dx, dz);
    if (dist < 0.5) return 0;
    const sp = Math.min(dist, speed * Math.min(dt, 0.05));
    s.x += (dx / dist) * sp; s.z += (dz / dist) * sp;
    g.rotation.y = Math.atan2(dx, dz);
    return dist;
  };
  const face = (s: typeof state.current, g: THREE.Group, x: number, z: number) => { g.rotation.y = Math.atan2(x - s.x, z - s.z); };
  useFrame(({ clock }, dt) => {
    const s = state.current, g = group.current; if (!g) return;
    const t = clock.elapsedTime; lastT.current = t;
    const near = Math.hypot(player.x - s.x, player.z - s.z);
    // a command from the panel
    if (conbot.cmdVersion !== s.seenCmd) {
      s.seenCmd = conbot.cmdVersion; const c = conbot.cmd;
      if (c) {
        if (c.kind === "lead") { s.mode = "lead"; s.tx = c.x; s.tz = c.z; s.arrive = c.arrive; botSay(c.text); play("Walking"); }
        else {
          if (c.kind === "say") botSay(c.text);
          const clip = c.kind === "emote" ? c.clip : c.clip;
          if (clip && actions[clip]) { s.mode = "emote"; s.after = talking ? "talk" : "walk"; s.until = t + (LOOPING.has(clip) ? 4 : clipSeconds(clip)); face(s, g, player.x, player.z); play(clip); }
        }
      }
    }
    if (bubble.current) bubble.current.visible = !!bubbleTex && performance.now() < conbot.lineUntil;
    switch (s.mode) {
      case "emote":
        if (t > s.until) { s.mode = s.after; play(s.after === "talk" ? "Idle" : "Walking"); if (s.after === "walk") nextCorner(s); }
        break;
      case "trick":
        if (t > s.until) { s.mode = s.after; play("Walking"); if (s.after === "walk") nextCorner(s); }
        break;
      case "approach": {
        if (near < 7) { s.mode = "talk"; play("Idle"); face(s, g, player.x, player.z); break; }
        play("Walking"); stepTo(s, g, player.x, player.z, dt, 7);
        break;
      }
      case "talk":
        face(s, g, player.x, player.z);
        if (near > 12 && useHall.getState().mode === "walk") { s.mode = "approach"; } // in map view there's no avatar to walk to
        break;
      case "lead": {
        // wait for the player when they fall behind, nag them once in a while
        if (near > 30) { play("Idle"); face(s, g, player.x, player.z); if (t > s.nextNag) { s.nextNag = t + 8; botSay("Keep up! This way."); } break; }
        play("Walking");
        const dist = stepTo(s, g, s.tx, s.tz, dt, 7.5);
        if (dist === 0) { botSay(s.arrive); s.mode = "emote"; s.after = talking ? "talk" : "walk"; s.until = t + clipSeconds("ThumbsUp"); face(s, g, player.x, player.z); play("ThumbsUp"); }
        break;
      }
      default: {
        // on its rounds: wave at whoever comes close, otherwise loop the plaza corners with a trick at each
        if (near < 12 && t > s.nextGreet) {
          s.nextGreet = t + 30; s.mode = "trick"; s.after = "walk"; s.until = t + clipSeconds("Wave"); face(s, g, player.x, player.z); play("Wave"); botSay(pick(GREETINGS)); break;
        }
        const dist = stepTo(s, g, s.tx, s.tz, dt, 5);
        if (dist === 0) {
          s.mode = "trick"; s.after = "walk"; const trick = TRICKS[Math.floor(Math.random() * TRICKS.length)]; s.until = t + (LOOPING.has(trick) ? 4 : clipSeconds(trick)); play(trick);
          face(s, g, ARCADE.x, ARCADE.z);
          const corners = LOOP;
          const i = corners.findIndex(([cx, cz]) => Math.abs(ARCADE.x + cx - s.tx) < 1 && Math.abs(ARCADE.z + cz - s.tz) < 1);
          const [nx, nz] = corners[(i + 1) % corners.length]; s.tx = ARCADE.x + nx; s.tz = ARCADE.z + nz;
        }
      }
    }
    g.position.set(s.x, 0, s.z);
    conbot.x = s.x; conbot.z = s.z;
  });
  return (
    <group ref={group} position={[state.current.x, 0, state.current.z]} onClick={(e) => { if (dragged(e)) return; e.stopPropagation(); useHall.getState().setPanel("conbot"); }}>
      <primitive ref={inner} object={obj} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.07, 0]}>
        <planeGeometry args={[5.5, 5.5]} />
        <meshBasicMaterial map={blob} transparent depthWrite={false} polygonOffset polygonOffsetFactor={-4} polygonOffsetUnits={-4} />
      </mesh>
      <sprite position={[0, 8.9, 0]} scale={[7, 2.2, 1]}>
        <spriteMaterial map={tag} transparent depthWrite={false} toneMapped={false} />
      </sprite>
      {bubbleTex && (
        <sprite ref={bubble} position={[0, 11.4, 0]} scale={[12.8, 4, 1]}>
          <spriteMaterial map={bubbleTex} transparent depthWrite={false} toneMapped={false} />
        </sprite>
      )}
    </group>
  );
}
