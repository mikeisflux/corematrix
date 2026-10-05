"use client";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { floorTexture, signTexture } from "./textures";
import { ARCADE } from "@/lib/hall/layout";
import { CABINET_ROWS } from "./Avatar";
import { useHall } from "@/lib/hall/store";
import { TwoSided } from "./Booth";

const tmp = new THREE.Object3D();
const SCREEN_COLORS = ["#ff2bd6", "#00f5ff", "#ffd166", "#5ee6c3", "#8338ec", "#ff6b6b"];

/** The arcade plaza in the middle of the hall: cabinets in rows, neon, a stage with the leaderboard. */
export function Arcade({ night }: { night: boolean }) {
  const carpet = useMemo(() => floorTexture("arcade", [ARCADE.w / 10, ARCADE.d / 10]), []);
  const cab = useRef<THREE.InstancedMesh>(null);
  const screen = useRef<THREE.InstancedMesh>(null);
  const setPanel = useHall((s) => s.setPanel);
  const cabinets = useMemo(() => {
    const out: { x: number; z: number; rot: number }[] = [];
    for (const row of CABINET_ROWS) {
      const vertical = row.d > row.w;
      const n = Math.floor((vertical ? row.d : row.w) / 3.2);
      for (let i = 0; i < n; i++) {
        const t = -((n - 1) * 3.2) / 2 + i * 3.2;
        out.push(vertical ? { x: row.x, z: row.z + t, rot: row.x < ARCADE.x ? Math.PI / 2 : -Math.PI / 2 } : { x: row.x + t, z: row.z, rot: row.z < ARCADE.z ? 0 : Math.PI });
      }
    }
    return out;
  }, []);
  useEffect(() => {
    if (!cab.current || !screen.current) return;
    const c = new THREE.Color();
    cabinets.forEach((k, i) => {
      tmp.position.set(k.x, 3, k.z); tmp.rotation.set(0, k.rot, 0); tmp.updateMatrix(); cab.current!.setMatrixAt(i, tmp.matrix);
      // screen sits on the face pointing toward the plaza center
      tmp.position.set(k.x + Math.sin(k.rot) * 1.3, 4.1, k.z + Math.cos(k.rot) * 1.3); tmp.rotation.set(-0.25, k.rot, 0); tmp.updateMatrix(); screen.current!.setMatrixAt(i, tmp.matrix);
      screen.current!.setColorAt(i, c.set(SCREEN_COLORS[i % SCREEN_COLORS.length]));
    });
    cab.current.instanceMatrix.needsUpdate = true; screen.current.instanceMatrix.needsUpdate = true;
    if (screen.current.instanceColor) screen.current.instanceColor.needsUpdate = true;
  }, [cabinets]);
  useFrame((state) => {
    if (!screen.current) return;
    const m = screen.current.material as THREE.MeshStandardMaterial;
    m.emissiveIntensity = 1.4 + Math.sin(state.clock.elapsedTime * 6) * 0.3;
  });
  const board = useMemo(() => signTexture(["TOP SCORES", "play for coins · 100 coins = $1 of booth value"], { bg: "#0a0a14", fg: "#00f5ff", w: 1024, h: 320, size: 72 }), []);
  const ride = useMemo(() => signTexture(["HALL FLYOVER", "drone ride · 5 coins"], { bg: "#1a1208", fg: "#ffd166", w: 512, h: 200, size: 52 }), []);
  return (
    <group onClick={(e) => { e.stopPropagation(); setPanel("arcade"); }} onPointerOver={() => { document.body.style.cursor = "pointer"; }} onPointerOut={() => { document.body.style.cursor = ""; }}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[ARCADE.x, 0.03, ARCADE.z]}><planeGeometry args={[ARCADE.w, ARCADE.d]} /><meshStandardMaterial map={carpet} roughness={1} /></mesh>
      <instancedMesh ref={cab} args={[undefined, undefined, cabinets.length]}>
        <boxGeometry args={[2.6, 6, 2.6]} />
        <meshStandardMaterial color="#1b1b2f" roughness={0.6} metalness={0.2} />
      </instancedMesh>
      <instancedMesh ref={screen} args={[undefined, undefined, cabinets.length]}>
        <planeGeometry args={[2, 1.6]} />
        <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={1.5} toneMapped={false} />
      </instancedMesh>
      {/* neon pillars at the corners */}
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
        <mesh key={i} position={[ARCADE.x + (sx * ARCADE.w) / 2, 7, ARCADE.z + (sz * ARCADE.d) / 2]}>
          <cylinderGeometry args={[0.5, 0.5, 14, 8]} />
          <meshStandardMaterial color="#ff2bd6" emissive="#ff2bd6" emissiveIntensity={night ? 2.5 : 1} toneMapped={false} />
        </mesh>
      ))}
      {/* stage + leaderboard screen at the back of the plaza */}
      <mesh position={[ARCADE.x, 1, ARCADE.z + ARCADE.d / 2 - 8]}><boxGeometry args={[36, 2, 10]} /><meshStandardMaterial color="#111827" /></mesh>
      <group position={[ARCADE.x, 9, ARCADE.z + ARCADE.d / 2 - 3.5]}><TwoSided w={34} h={10.6}><meshBasicMaterial map={board} toneMapped={false} /></TwoSided></group>
      {/* flyover pad */}
      <mesh position={[ARCADE.x, 0.4, ARCADE.z]}><cylinderGeometry args={[6, 6, 0.8, 24]} /><meshStandardMaterial color="#ffd166" emissive="#ffd166" emissiveIntensity={night ? 0.6 : 0.1} /></mesh>
      <group position={[ARCADE.x, 4.5, ARCADE.z - 6.5]}><TwoSided w={10} h={3.9}><meshBasicMaterial map={ride} toneMapped={false} /></TwoSided></group>
      {night && <pointLight position={[ARCADE.x, 12, ARCADE.z]} intensity={300} distance={80} color="#8338ec" />}
    </group>
  );
}

/** The drone flyover path: lifts off the arcade pad, sweeps the length of the hall at truss height and returns. */
export function flyoverCurve(): THREE.CatmullRomCurve3 {
  const pts: THREE.Vector3[] = [];
  const { x, z } = ARCADE;
  pts.push(new THREE.Vector3(x, 3, z), new THREE.Vector3(x + 20, 14, z - 30), new THREE.Vector3(x + 160, 22, z - 60), new THREE.Vector3(x + 380, 26, z - 20), new THREE.Vector3(x + 470, 24, z + 50), new THREE.Vector3(x + 300, 20, z + 70), new THREE.Vector3(x + 60, 18, z + 40), new THREE.Vector3(x - 120, 24, z - 50), new THREE.Vector3(x - 380, 26, z - 30), new THREE.Vector3(x - 470, 24, z + 40), new THREE.Vector3(x - 240, 22, z + 70), new THREE.Vector3(x - 60, 14, z + 30), new THREE.Vector3(x, 6, z + 4));
  return new THREE.CatmullRomCurve3(pts, true, "catmullrom", 0.4);
}
