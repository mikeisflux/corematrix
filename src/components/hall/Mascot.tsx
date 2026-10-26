"use client";
import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useAnimations } from "@react-three/drei";
import { ARCADE } from "@/lib/hall/layout";
import { signTexture } from "./textures";
import { useModelUrl } from "./models";

/** The con mascot: the CC0 RobotExpressive robot wandering the arcade plaza, stopping to wave, dance and give thumbs up. */
export function Mascot() {
  const url = useModelUrl("robot");
  if (!url) return null;
  return <Suspense fallback={null}><Robot url={url} /></Suspense>;
}

const TRICKS = ["Wave", "Dance", "ThumbsUp", "Jump", "Yes"];
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

function Robot({ url }: { url: string }) {
  const { scene, animations } = useGLTF(url);
  const obj = useMemo(() => {
    const c = scene.clone(true);
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
  const { actions } = useAnimations(animations, inner);
  const state = useRef({ x: ARCADE.x - 30, z: ARCADE.z - 30, tx: ARCADE.x + 30, tz: ARCADE.z - 30, mode: "walk" as "walk" | "trick", until: 0, current: "" });
  const play = (name: string, loop = true) => {
    const s = state.current; if (s.current === name) return;
    const next = actions[name]; const prev = actions[s.current];
    if (!next) return;
    next.reset().setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity).fadeIn(0.25).play();
    next.clampWhenFinished = !loop;
    if (prev) prev.fadeOut(0.25);
    s.current = name;
  };
  useEffect(() => { play("Walking"); }, [actions]); // eslint-disable-line react-hooks/exhaustive-deps
  useFrame(({ clock }, dt) => {
    const s = state.current, g = group.current; if (!g) return;
    const t = clock.elapsedTime;
    if (s.mode === "trick") { if (t > s.until) { s.mode = "walk"; play("Walking"); } return; }
    const dx = s.tx - s.x, dz = s.tz - s.z, dist = Math.hypot(dx, dz);
    if (dist < 1) {
      // corner reached: turn to face the plaza, do a trick, then pick the next corner of the loop
      s.mode = "trick"; s.until = t + 3.5; play(TRICKS[Math.floor(Math.random() * TRICKS.length)], false);
      g.rotation.y = Math.atan2(ARCADE.x - s.x, ARCADE.z - s.z);
      const corners = [[-30, -30], [30, -30], [30, 30], [-30, 30]];
      const i = corners.findIndex(([cx, cz]) => Math.abs(ARCADE.x + cx - s.tx) < 1 && Math.abs(ARCADE.z + cz - s.tz) < 1);
      const [nx, nz] = corners[(i + 1) % corners.length]; s.tx = ARCADE.x + nx; s.tz = ARCADE.z + nz;
      return;
    }
    const sp = 5 * Math.min(dt, 0.05);
    s.x += (dx / dist) * sp; s.z += (dz / dist) * sp;
    g.position.set(s.x, 0, s.z); g.rotation.y = Math.atan2(dx, dz);
  });
  return (
    <group ref={group} position={[state.current.x, 0, state.current.z]}>
      <primitive ref={inner} object={obj} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.07, 0]}>
        <planeGeometry args={[5.5, 5.5]} />
        <meshBasicMaterial map={blob} transparent depthWrite={false} polygonOffset polygonOffsetFactor={-4} polygonOffsetUnits={-4} />
      </mesh>
      <sprite position={[0, 8.9, 0]} scale={[7, 2.2, 1]}>
        <spriteMaterial map={tag} transparent depthWrite={false} toneMapped={false} />
      </sprite>
    </group>
  );
}
