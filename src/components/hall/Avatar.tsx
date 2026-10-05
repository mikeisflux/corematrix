"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useHall, type AvatarConfig, DEFAULT_AVATAR, SKIN_TONES, HAIR_COLORS, OUTFIT_COLORS } from "@/lib/hall/store";
import { hallLayout, standPoint, boothSpace, X0, Z0, HALL_LENGTH, HALL_DEPTH, Z_FRONT, Z_BACK, ARCADE, type BoothSpace } from "@/lib/hall/layout";

/** Shared input state written by the HUD joystick and read every frame (no React re-renders). */
export const input = { joy: { x: 0, y: 0 }, run: false, yawDrag: 0 };
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
export function AvatarModel({ config, phase, idle }: { config: AvatarConfig; phase: React.RefObject<number>; idle?: boolean }) {
  const wide = config.body === "a";
  const shoulders = wide ? 2.1 : 1.7, hips = wide ? 1.7 : 1.9;
  const lArm = useRef<THREE.Mesh>(null), rArm = useRef<THREE.Mesh>(null), lLeg = useRef<THREE.Mesh>(null), rLeg = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const p = idle ? 0 : phase.current ?? 0;
    const s = Math.sin(p) * 0.55;
    if (lArm.current) lArm.current.rotation.x = s; if (rArm.current) rArm.current.rotation.x = -s;
    if (lLeg.current) lLeg.current.rotation.x = -s; if (rLeg.current) rLeg.current.rotation.x = s;
  });
  const hairColor = config.hairColor;
  return (
    <group>
      {/* legs */}
      <group position={[0, 2.9, 0]}>
        <mesh ref={lLeg} position={[-0.45, 0, 0]}><group /><cylinderGeometry args={[0.36, 0.3, 2.9, 8]} /><meshStandardMaterial color={config.pants} /></mesh>
        <mesh ref={rLeg} position={[0.45, 0, 0]}><cylinderGeometry args={[0.36, 0.3, 2.9, 8]} /><meshStandardMaterial color={config.pants} /></mesh>
      </group>
      {/* torso */}
      <mesh position={[0, 4.1, 0]}><cylinderGeometry args={[shoulders / 2, hips / 2, 2.3, 10]} /><meshStandardMaterial color={config.shirt} /></mesh>
      {/* arms */}
      <mesh ref={lArm} position={[-(shoulders / 2 + 0.3), 4.6, 0]}><cylinderGeometry args={[0.24, 0.2, 2.4, 6]} /><meshStandardMaterial color={config.skin} /></mesh>
      <mesh ref={rArm} position={[shoulders / 2 + 0.3, 4.6, 0]}><cylinderGeometry args={[0.24, 0.2, 2.4, 6]} /><meshStandardMaterial color={config.skin} /></mesh>
      {/* head */}
      <mesh position={[0, 5.95, 0]}><sphereGeometry args={[0.72, 14, 12]} /><meshStandardMaterial color={config.skin} /></mesh>
      {config.hair === "short" && <mesh position={[0, 6.25, -0.08]}><sphereGeometry args={[0.74, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.1]} /><meshStandardMaterial color={hairColor} /></mesh>}
      {config.hair === "buzz" && <mesh position={[0, 6.2, 0]}><sphereGeometry args={[0.73, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.6]} /><meshStandardMaterial color={hairColor} /></mesh>}
      {config.hair === "long" && <><mesh position={[0, 6.2, -0.05]}><sphereGeometry args={[0.76, 12, 8, 0, Math.PI * 2, 0, Math.PI / 1.9]} /><meshStandardMaterial color={hairColor} /></mesh><mesh position={[0, 5.2, -0.45]}><boxGeometry args={[1.3, 1.9, 0.6]} /><meshStandardMaterial color={hairColor} /></mesh></>}
      {config.hair === "bun" && <><mesh position={[0, 6.25, -0.05]}><sphereGeometry args={[0.74, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2.1]} /><meshStandardMaterial color={hairColor} /></mesh><mesh position={[0, 6.7, -0.5]}><sphereGeometry args={[0.32, 8, 8]} /><meshStandardMaterial color={hairColor} /></mesh></>}
      {/* lanyard badge */}
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
  const { camera } = useThree();
  const group = useRef<THREE.Group>(null);
  const pos = useRef(new THREE.Vector3(0, 0, Z0 + 18));
  const heading = useRef(0); // dx = sin(h), dz = cos(h): heading 0 faces +z, into the hall
  const yaw = useRef(0);
  const phase = useRef(0);
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
    if (keys.has("w") || keys.has("arrowup")) fz += 1;
    if (keys.has("s") || keys.has("arrowdown")) fz -= 1;
    if (keys.has("a") || keys.has("arrowleft")) fx -= 1;
    if (keys.has("d") || keys.has("arrowright")) fx += 1;
    fx += input.joy.x; fz -= input.joy.y;
    if (keys.has("q")) yaw.current += 1.8 * d;
    if (keys.has("e") && false) yaw.current -= 1.8 * d;
    yaw.current += input.yawDrag; input.yawDrag = 0;
    const run = keys.has("shift") || input.run;
    const len = Math.hypot(fx, fz);
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
      phase.current += d * (run ? 14 : 9);
      // the camera yaw eases toward the heading so the player sees where they go
      let diff = heading.current - yaw.current; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      yaw.current += diff * Math.min(1, d * 1.5);
    }
    group.current.position.copy(pos.current);
    group.current.rotation.y = heading.current;
    // camera
    const back = fp.current ? 0 : 20, up = fp.current ? 5.6 : 10;
    const cx = pos.current.x - Math.sin(yaw.current) * back, cz = pos.current.z - Math.cos(yaw.current) * back;
    camera.position.lerp(new THREE.Vector3(cx, up, cz), Math.min(1, d * 6));
    camera.lookAt(pos.current.x + Math.sin(yaw.current) * 20, 4.5, pos.current.z + Math.cos(yaw.current) * 20);
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
      {!firstPerson && <AvatarModel config={avatar} phase={phase} />}
      <pointLight position={[0, 7, 0]} intensity={6} distance={14} color="#ffffff" />
    </group>
  );
}

/* ---------- NPC crowd wandering the aisles ---------- */
interface Npc { config: AvatarConfig; x: number; z: number; dz: number; speed: number; phase: number; corridor: number }
function rnd(seed: number) { return () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }; }
export function Crowd({ count = 36 }: { count?: number }) {
  const npcs = useMemo<Npc[]>(() => {
    const r = rnd(42);
    const corridors = hallLayout().filter((b) => b.kind === "exhibitor" && b.facing === 1).map((b) => b.x + b.w / 2 + 5);
    const unique = Array.from(new Set(corridors.map((x) => Math.round(x))));
    return Array.from({ length: count }, (_, i) => {
      const corridor = unique[Math.floor(r() * unique.length)];
      return {
        config: { ...DEFAULT_AVATAR, body: r() < 0.5 ? "a" : "b", skin: SKIN_TONES[Math.floor(r() * SKIN_TONES.length)], hair: (["short", "long", "buzz", "bun", "bald"] as const)[Math.floor(r() * 5)], hairColor: HAIR_COLORS[Math.floor(r() * 9)], shirt: OUTFIT_COLORS[Math.floor(r() * OUTFIT_COLORS.length)], pants: OUTFIT_COLORS[Math.floor(r() * OUTFIT_COLORS.length)] },
        x: corridor + (r() - 0.5) * 4, z: Z_FRONT + r() * (Z_BACK - Z_FRONT), dz: r() < 0.5 ? 1 : -1, speed: 4 + r() * 4, phase: r() * 6, corridor: i,
      };
    });
  }, [count]);
  const refs = useRef<(THREE.Group | null)[]>([]);
  const phases = useMemo(() => npcs.map((n) => ({ current: n.phase })), [npcs]);
  useFrame((_, dt) => {
    const d = Math.min(dt, 0.05);
    npcs.forEach((n, i) => {
      n.z += n.dz * n.speed * d;
      if (n.z > Z_BACK + 6 || n.z < Z_FRONT - 6) n.dz *= -1;
      phases[i].current += d * 8;
      const g = refs.current[i];
      if (g) { g.position.set(n.x, 0, n.z); g.rotation.y = n.dz > 0 ? 0 : Math.PI; }
    });
  });
  return <>{npcs.map((n, i) => <group key={i} ref={(el) => { refs.current[i] = el; }}><AvatarModel config={n.config} phase={phases[i]} /></group>)}</>;
}
