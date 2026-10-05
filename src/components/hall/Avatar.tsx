"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useHall, type AvatarConfig, DEFAULT_AVATAR, SKIN_TONES, HAIR_COLORS, OUTFIT_COLORS } from "@/lib/hall/store";
import { hallLayout, standPoint, boothSpace, X0, Z0, HALL_LENGTH, HALL_DEPTH, Z_FRONT, Z_BACK, ARCADE, type BoothSpace } from "@/lib/hall/layout";
import { AvatarRig, useModelUrl, type Motion } from "./models";
import { Suspense } from "react";

/** Shared input state written by the HUD joystick and read every frame (no React re-renders). */
export const input = { joy: { x: 0, y: 0 }, run: false, yawDrag: 0, pitchDrag: 0 };
const keys = new Set<string>();
if (typeof window !== "undefined") {
  window.addEventListener("keydown", (e) => { const t = e.target as HTMLElement; if (t?.tagName === "INPUT" || t?.tagName === "TEXTAREA" || t?.isContentEditable) return; keys.add(e.key.toLowerCase()); });
  window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
  window.addEventListener("blur", () => keys.clear());
}

/* ---------- collision grid over booth rectangles ---------- */
const CELL = 20;
let grid: Map<string, BoothSpace[]> | null = null;
function cells() {
  if (grid) return grid;
  grid = new Map();
  for (const b of hallLayout()) {
    const x0 = Math.floor((b.x - b.w / 2) / CELL), x1 = Math.floor((b.x + b.w / 2) / CELL), z0 = Math.floor((b.z - b.d / 2) / CELL), z1 = Math.floor((b.z + b.d / 2) / CELL);
    for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) { const k = `${i},${j}`; const arr = grid.get(k) ?? []; arr.push(b); grid.set(k, arr); }
  }
  return grid;
}
const R = 1.1; // body radius
function blocked(x: number, z: number): boolean {
  if (x < X0 + 2 || x > X0 + HALL_LENGTH - 2 || z < Z0 + 2 || z > Z0 + HALL_DEPTH - 2) return true;
  for (const b of cells().get(`${Math.floor(x / CELL)},${Math.floor(z / CELL)}`) ?? []) {
    if (Math.abs(x - b.x) < b.w / 2 + R && Math.abs(z - b.z) < b.d / 2 + R) return true;
  }
  // arcade cabinets live in rows; keep the plaza walkable except the cabinet rows
  for (const row of CABINET_ROWS) if (Math.abs(x - row.x) < row.w / 2 + R && Math.abs(z - row.z) < row.d / 2 + R) return true;
  return false;
}
export const CABINET_ROWS = [
  { x: ARCADE.x - 24, z: ARCADE.z - 18, w: 3, d: 30 }, { x: ARCADE.x - 24, z: ARCADE.z + 18, w: 3, d: 30 },
  { x: ARCADE.x + 24, z: ARCADE.z - 18, w: 3, d: 30 }, { x: ARCADE.x + 24, z: ARCADE.z + 18, w: 3, d: 30 },
  { x: ARCADE.x, z: ARCADE.z - 34, w: 30, d: 3 }, { x: ARCADE.x, z: ARCADE.z + 34, w: 30, d: 3 },
];
export function isBlocked(x: number, z: number) { return blocked(x, z); }

/* ---------- the figure ---------- */
/** An avatar: the rigged GLB from public/models when present (idle/walk/run, recolored by material name), else primitives. */
export function AvatarModel({ config, motion, idle }: { config: AvatarConfig; motion?: Motion; idle?: boolean }) {
  const url = useModelUrl(`avatar-${config.body}`);
  const still = useMemo<Motion>(() => ({ speed: 0 }), []);
  const m = idle || !motion ? still : motion;
  if (url) return <Suspense fallback={<PrimitiveAvatar config={config} motion={m} />}><AvatarRig config={config} motion={m} url={url} /></Suspense>;
  return <PrimitiveAvatar config={config} motion={m} />;
}

/** Fallback figure built from primitives; swings limbs from the shared motion state. */
function PrimitiveAvatar({ config, motion }: { config: AvatarConfig; motion: Motion }) {
  const wide = config.body === "a";
  const shoulders = wide ? 2.1 : 1.7, hips = wide ? 1.7 : 1.9;
  const lArm = useRef<THREE.Mesh>(null), rArm = useRef<THREE.Mesh>(null), lLeg = useRef<THREE.Mesh>(null), rLeg = useRef<THREE.Mesh>(null);
  const phase = useRef(0);
  useFrame((_, dt) => {
    phase.current += dt * (motion.speed >= 2 ? 14 : motion.speed >= 1 ? 9 : 0);
    const s = motion.speed > 0 ? Math.sin(phase.current) * 0.55 : 0;
    if (lArm.current) lArm.current.rotation.x = s; if (rArm.current) rArm.current.rotation.x = -s;
    if (lLeg.current) lLeg.current.rotation.x = -s; if (rLeg.current) rLeg.current.rotation.x = s;
  });
  const hairColor = config.hairColor;
  return (
    <group>
      <group position={[0, 2.9, 0]}>
        <mesh ref={lLeg} position={[-0.45, 0, 0]}><cylinderGeometry args={[0.36, 0.3, 2.9, 8]} /><meshStandardMaterial color={config.pants} /></mesh>
        <mesh ref={rLeg} position={[0.45, 0, 0]}><cylinderGeometry args={[0.36, 0.3, 2.9, 8]} /><meshStandardMaterial color={config.pants} /></mesh>
      </group>
      <mesh position={[0, 4.1, 0]}><cylinderGeometry args={[shoulders / 2, hips / 2, 2.3, 10]} /><meshStandardMaterial color={config.shirt} /></mesh>
      <mesh ref={lArm} position={[-(shoulders / 2 + 0.3), 4.6, 0]}><cylinderGeometry args={[0.24, 0.2, 2.4, 6]} /><meshStandardMaterial color={config.skin} /></mesh>
      <mesh ref={rArm} position={[shoulders / 2 + 0.3, 4.6, 0]}><cylinderGeometry args={[0.24, 0.2, 2.4, 6]} /><meshStandardMaterial color={config.skin} /></mesh>
      <mesh position={[0, 5.95, 0]}><sphereGeometry args={[0.72, 14, 12]} /><meshStandardMaterial color={config.skin} /></mesh>
      {config.hair !== "bald" && <mesh position={[0, 6.25, -0.08]}><sphereGeometry args={[0.74, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.1]} /><meshStandardMaterial color={hairColor} /></mesh>}
      {config.hair === "long" && <mesh position={[0, 5.2, -0.45]}><boxGeometry args={[1.3, 1.9, 0.6]} /><meshStandardMaterial color={hairColor} /></mesh>}
      {config.hair === "bun" && <mesh position={[0, 6.7, -0.5]}><sphereGeometry args={[0.32, 8, 8]} /><meshStandardMaterial color={hairColor} /></mesh>}
      <mesh position={[0, 4.2, hips / 2 + 0.05]}><boxGeometry args={[0.6, 0.8, 0.05]} /><meshStandardMaterial color="#f8fafc" /></mesh>
    </group>
  );
}

/* ---------- the player: walk mode controls + third-person camera ---------- */
const WALK = 9, RUN = 17;
export function Player() {
  const mode = useHall((s) => s.mode);
  const avatar = useHall((s) => s.avatar);
  const walkTarget = useHall((s) => s.walkTarget);
  const setWalkTarget = useHall((s) => s.setWalkTarget);
  const select = useHall((s) => s.select);
  const booths = useHall((s) => s.booths);
  const { camera, gl } = useThree();
  const group = useRef<THREE.Group>(null);
  const pos = useRef(new THREE.Vector3(0, 0, Z0 + 28));
  const heading = useRef(0); // dx = sin(h), dz = cos(h): heading 0 faces +z, into the hall
  const yaw = useRef(0);
  const pitch = useRef(0); // mouse tilt, radians; + looks up

  // mouse look: drag anywhere on the hall to turn the view (a short click still opens banners)
  useEffect(() => {
    if (mode !== "walk") return;
    const el = gl.domElement;
    let down = false, lx = 0, ly = 0;
    const onDown = (e: PointerEvent) => { if (e.button !== 0 && e.button !== 2) return; down = true; lx = e.clientX; ly = e.clientY; };
    const onMove = (e: PointerEvent) => {
      if (!down) return;
      input.yawDrag -= (e.clientX - lx) * 0.0045; input.pitchDrag -= (e.clientY - ly) * 0.003;
      lx = e.clientX; ly = e.clientY;
    };
    const onUp = () => { down = false; };
    const onCtx = (e: Event) => e.preventDefault();
    el.addEventListener("pointerdown", onDown); window.addEventListener("pointermove", onMove); window.addEventListener("pointerup", onUp); window.addEventListener("blur", onUp); el.addEventListener("contextmenu", onCtx);
    el.style.cursor = "grab";
    return () => { el.removeEventListener("pointerdown", onDown); window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); window.removeEventListener("blur", onUp); el.removeEventListener("contextmenu", onCtx); el.style.cursor = ""; };
  }, [mode, gl]);
  const motion = useRef<Motion>({ speed: 0 }).current;
  const near = useRef<number | null>(null);
  const lastNear = useRef(0);
  const [firstPerson, setFirstPerson] = useState(false);
  const fp = useRef(false);

  useEffect(() => {
    if (walkTarget == null) return;
    const sp = standPoint(walkTarget);
    const b = boothSpace(walkTarget);
    pos.current.set(sp.x, 0, sp.z);
    if (b) heading.current = Math.atan2(b.x - sp.x, b.z - sp.z);
    yaw.current = heading.current;
    setWalkTarget(null);
  }, [walkTarget, setWalkTarget]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (mode !== "walk") return;
      const t = e.target as HTMLElement; if (t?.tagName === "INPUT" || t?.tagName === "TEXTAREA") return;
      if (e.key === "e" || e.key === "E" || e.key === "Enter") { if (near.current) select(near.current); }
      if (e.key === "v" || e.key === "V") { fp.current = !fp.current; setFirstPerson(fp.current); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mode, select]);

  useFrame((state, dt) => {
    if (mode !== "walk" || !group.current) return;
    const d = Math.min(dt, 0.05);
    let fx = 0, fz = 0;
    // arrows: up/down walk, left/right turn. WASD: W/S walk, A/D strafe. Q/E also turn.
    if (keys.has("w") || keys.has("arrowup")) fz += 1;
    if (keys.has("s") || keys.has("arrowdown")) fz -= 1;
    if (keys.has("a")) fx -= 1;
    if (keys.has("d")) fx += 1;
    const joy = Math.hypot(input.joy.x, input.joy.y) > 0.05;
    fx += input.joy.x; fz -= input.joy.y;
    if (keys.has("arrowleft") || keys.has("q")) yaw.current += 2.2 * d;
    if (keys.has("arrowright")) yaw.current -= 2.2 * d;
    yaw.current += input.yawDrag; input.yawDrag = 0;
    pitch.current = THREE.MathUtils.clamp(pitch.current + input.pitchDrag, -0.45, 0.6); input.pitchDrag = 0;
    const run = keys.has("shift") || input.run;
    const len = Math.hypot(fx, fz);
    if (len <= 0.01) motion.speed = 0;
    if (len > 0.01) {
      const nx = fx / Math.max(1, len), nz = fz / Math.max(1, len);
      // camera-relative: forward is the direction the camera looks (yaw)
      const sin = Math.sin(yaw.current), cos = Math.cos(yaw.current);
      const dx = nx * cos + nz * sin, dz = -nx * sin + nz * cos;
      const sp = (run ? RUN : WALK) * d;
      const nxp = pos.current.x + dx * sp, nzp = pos.current.z + dz * sp;
      if (!blocked(nxp, pos.current.z)) pos.current.x = nxp;
      if (!blocked(pos.current.x, nzp)) pos.current.z = nzp;
      heading.current = Math.atan2(dx, dz);
      motion.speed = run ? 2 : 1;
      // on the touch joystick the view eases toward the heading; with keys and mouse the view is yours
      if (joy) { let diff = heading.current - yaw.current; diff = Math.atan2(Math.sin(diff), Math.cos(diff)); yaw.current += diff * Math.min(1, d * 1.5); }
    }
    group.current.position.copy(pos.current);
    group.current.rotation.y = heading.current;
    // camera
    const back = fp.current ? 0 : 20, up = fp.current ? 5.6 : 10;
    // keep the camera inside the building so it never ends up looking at the back of a wall
    const cx = THREE.MathUtils.clamp(pos.current.x - Math.sin(yaw.current) * back, X0 + 3, X0 + HALL_LENGTH - 3);
    const cz = THREE.MathUtils.clamp(pos.current.z - Math.cos(yaw.current) * back, Z0 + 3, Z0 + HALL_DEPTH - 3);
    camera.position.lerp(new THREE.Vector3(cx, up, cz), Math.min(1, d * 6));
    camera.lookAt(pos.current.x + Math.sin(yaw.current) * 20, 4.5 + Math.tan(pitch.current) * 20 + (fp.current ? 1.1 : 0), pos.current.z + Math.cos(yaw.current) * 20);
    // nearest claimed booth in front of us, every 0.25s
    if (state.clock.elapsedTime - lastNear.current > 0.25) {
      lastNear.current = state.clock.elapsedTime;
      let best: number | null = null, bd = 22;
      for (const b of booths.values()) {
        const s = boothSpace(b.id); if (!s) continue;
        const dist = Math.hypot(s.x - pos.current.x, s.z - pos.current.z);
        if (dist < bd) { bd = dist; best = b.id; }
      }
      if (best !== near.current) { near.current = best; useHall.getState().setNear(best); }
    }
  });

  if (mode !== "walk") return null;
  return (
    <group ref={group}>
      {!firstPerson && <AvatarModel config={avatar} motion={motion} />}
      <pointLight position={[0, 7, 0]} intensity={6} distance={14} color="#ffffff" />
    </group>
  );
}

/* ---------- NPC crowd wandering the aisles ---------- */
interface Npc { config: AvatarConfig; x: number; z: number; dz: number; speed: number; corridor: number; pauseUntil: number; nextPause: number }
function rnd(seed: number) { return () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; }
export function Crowd({ count = 110 }: { count?: number }) {
  const npcs = useMemo<Npc[]>(() => {
    const r = rnd(42);
    const corridors = hallLayout().filter((b) => b.facing === 1).map((b) => b.x + b.w / 2 + 5);
    const unique = Array.from(new Set(corridors.map((x) => Math.round(x))));
    return Array.from({ length: count }, (_, i) => {
      const corridor = unique[Math.floor(r() * unique.length)];
      return {
        config: { ...DEFAULT_AVATAR, body: r() < 0.5 ? "a" : "b", skin: SKIN_TONES[Math.floor(r() * SKIN_TONES.length)], hair: (["short", "long", "buzz", "bun", "bald"] as const)[Math.floor(r() * 5)], hairColor: HAIR_COLORS[Math.floor(r() * 9)], shirt: OUTFIT_COLORS[Math.floor(r() * OUTFIT_COLORS.length)], pants: OUTFIT_COLORS[Math.floor(r() * OUTFIT_COLORS.length)] },
        x: corridor + (r() - 0.5) * 4, z: Z_FRONT + r() * (Z_BACK - Z_FRONT), dz: r() < 0.5 ? 1 : -1, speed: 3.5 + r() * 5, corridor: i, pauseUntil: 0, nextPause: 4 + r() * 20,
      };
    });
  }, [count]);
  const refs = useRef<(THREE.Group | null)[]>([]);
  const motions = useMemo<Motion[]>(() => npcs.map(() => ({ speed: 1 })), [npcs]);
  useFrame(({ camera, clock }, dt) => {
    const d = Math.min(dt, 0.05);
    const t = clock.elapsedTime;
    npcs.forEach((n, i) => {
      // stop at a booth now and then, then move on
      if (t < n.pauseUntil) { motions[i].speed = 0; }
      else {
        if (t > n.nextPause) { n.pauseUntil = t + 2 + Math.random() * 5; n.nextPause = n.pauseUntil + 6 + Math.random() * 25; motions[i].speed = 0; }
        else { motions[i].speed = n.speed > 7.5 ? 2 : 1; n.z += n.dz * n.speed * d; }
      }
      if (n.z > Z_BACK + 6 || n.z < Z_FRONT - 6) n.dz *= -1;
      const g = refs.current[i];
      if (g) {
        g.position.set(n.x, 0, n.z); g.rotation.y = n.dz > 0 ? 0 : Math.PI;
        // only draw people near the camera; the rest keep walking unseen
        g.visible = Math.hypot(camera.position.x - n.x, camera.position.z - n.z) < 170;
      }
    });
  });
  return <>{npcs.map((n, i) => <group key={i} ref={(el) => { refs.current[i] = el; }}><AvatarModel config={n.config} motion={motions[i]} /></group>)}</>;
}
