"use client";
import { Suspense, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useAnimations } from "@react-three/drei";
import { ARCADE } from "@/lib/hall/layout";
import { useModelUrl } from "./models";

/** The con mascot: the CC0 RobotExpressive robot wandering the arcade plaza, stopping to wave, dance and give thumbs up. */
export function Mascot() {
  const url = useModelUrl("robot");
  if (!url) return null;
  return <Suspense fallback={null}><Robot url={url} /></Suspense>;
}

const TRICKS = ["Wave", "Dance", "ThumbsUp", "Jump", "Yes"];
function Robot({ url }: { url: string }) {
  const { scene, animations } = useGLTF(url);
  const obj = useMemo(() => { const c = scene.clone(true); const box = new THREE.Box3().setFromObject(c); const h = box.max.y - box.min.y || 1; c.scale.setScalar(7 / h); c.position.y = -box.min.y * (7 / h); return c; }, [scene]);
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
      // corner reached: do a trick, then pick the next corner of the plaza loop
      s.mode = "trick"; s.until = t + 3.5; play(TRICKS[Math.floor(Math.random() * TRICKS.length)], false);
      const corners = [[-30, -30], [30, -30], [30, 30], [-30, 30]];
      const i = corners.findIndex(([cx, cz]) => Math.abs(ARCADE.x + cx - s.tx) < 1 && Math.abs(ARCADE.z + cz - s.tz) < 1);
      const [nx, nz] = corners[(i + 1) % corners.length]; s.tx = ARCADE.x + nx; s.tz = ARCADE.z + nz;
      return;
    }
    const sp = 5 * Math.min(dt, 0.05);
    s.x += (dx / dist) * sp; s.z += (dz / dist) * sp;
    g.position.set(s.x, 0, s.z); g.rotation.y = Math.atan2(dx, dz);
  });
  return <group ref={group} position={[state.current.x, 0, state.current.z]}><primitive ref={inner} object={obj} /></group>;
}
