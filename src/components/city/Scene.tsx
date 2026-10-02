"use client";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Stars } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette, SMAA, BrightnessContrast, HueSaturation } from "@react-three/postprocessing";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { Building } from "./Building";
import { signTexture, logoTexture } from "./textures";
import { useCity, track } from "@/lib/city/store";
import { avenueLength, BLOCK_LENGTH, CROSS_STREET, LOT_DEPTH, LOT_WIDTH, PER_SIDE, plotPosition, ROAD_HALF, heightForValue } from "@/lib/city/layout";
import { PLOTS_PER_BLOCK, TOTAL_PLOTS, zoneFor } from "@/lib/config";

const tmpObj = new THREE.Object3D();
const tmpColor = new THREE.Color();

export function Scene() {
  const plots = useCity((s) => s.plots);
  const night = useCity((s) => s.night);
  const hovered = useCity((s) => s.hovered);
  const selected = useCity((s) => s.selected);
  const billboards = useCity((s) => s.billboards);
  const list = useMemo(() => Array.from(plots.values()), [plots]);
  const maxPlot = useMemo(() => Math.max(PLOTS_PER_BLOCK * 3, ...list.map((p) => p.id)), [list]);
  const blocks = Math.ceil(maxPlot / PLOTS_PER_BLOCK) + 1;
  const length = avenueLength(blocks * PLOTS_PER_BLOCK);

  return (
    <>
      <Lighting night={night} length={length} />
      <Ground length={length} blocks={blocks} night={night} />
      <Trees length={length} blocks={blocks} />
      <Cars length={length} night={night} />
      <People length={length} />
      <EmptyLots claimed={plots} upTo={Math.min(TOTAL_PLOTS, blocks * PLOTS_PER_BLOCK)} />
      <Landmarks length={length} night={night} />
      <BlockBillboards blocks={blocks} billboards={billboards} night={night} />
      <Airship length={length} billboards={billboards} />
      {list.map((p) => (
        <Building key={p.id} plot={p} night={night} hovered={hovered === p.id} selected={selected === p.id} />
      ))}
      <PreviewBuilding />
      <CameraRig length={length} />
      <Impressions />
      <EffectComposer multisampling={0}>
        <SMAA />
        <Bloom intensity={night ? 0.7 : 0.2} luminanceThreshold={night ? 0.7 : 0.97} luminanceSmoothing={0.3} mipmapBlur />
        <BrightnessContrast brightness={0.02} contrast={0.12} />
        <HueSaturation saturation={0.12} />
        <Vignette eskil={false} offset={0.2} darkness={night ? 0.7 : 0.45} />
      </EffectComposer>
    </>
  );
}

function Lighting({ night, length }: { night: boolean; length: number }) {
  return (
    <>
      <ambientLight intensity={night ? 0.25 : 0.7} color={night ? "#8aa0ff" : "#ffffff"} />
      <hemisphereLight intensity={night ? 0.2 : 0.5} color={night ? "#223" : "#cfe8ff"} groundColor={night ? "#000" : "#3b6e3b"} />
      <directionalLight
        position={[length * 0.3, 160, 120]}
        intensity={night ? 0.15 : 1.6}
        color={night ? "#6c7cff" : "#fff6e0"}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-220}
        shadow-camera-right={220}
        shadow-camera-top={220}
        shadow-camera-bottom={-220}
        shadow-camera-far={600}
      />
      {night && <Stars radius={400} depth={60} count={2500} factor={4} fade />}
      <fog attach="fog" args={[night ? "#0b1020" : "#d9e9f7", 220, 800]} />
      <color attach="background" args={[night ? "#0b1020" : "#bcd8f0"]} />
    </>
  );
}

function noiseTexture(a: string, b: string, size = 128, repeat = 60): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d")!;
  g.fillStyle = a;
  g.fillRect(0, 0, size, size);
  g.fillStyle = b;
  let seed = 7;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < size * 6; i++) g.fillRect(Math.floor(r() * size), Math.floor(r() * size), 1 + Math.floor(r() * 2), 1);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function Ground({ length, blocks, night }: { length: number; blocks: number; night: boolean }) {
  const grass = useMemo(() => noiseTexture(night ? "#1b3a22" : "#62a860", night ? "#142c1a" : "#4f934f", 128, 140), [night]);
  const asphalt = useMemo(() => noiseTexture("#2b2f36", "#353a42", 128, 90), []);
  const pavers = useMemo(() => noiseTexture(night ? "#8d8f94" : "#d9d4c7", night ? "#7a7c80" : "#c9c3b4", 64, 200), [night]);
  const lane = useMemo(() => {
    const g = new THREE.PlaneGeometry(3, 0.25);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);
  const laneCount = Math.floor(length / 6);
  const laneRef = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    if (!laneRef.current) return;
    for (let i = 0; i < laneCount; i++) {
      tmpObj.position.set(i * 6 + 1.5, 0.03, 0);
      tmpObj.updateMatrix();
      laneRef.current.setMatrixAt(i, tmpObj.matrix);
    }
    laneRef.current.instanceMatrix.needsUpdate = true;
  }, [laneCount]);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[length / 2, -0.05, 0]} receiveShadow>
        <planeGeometry args={[length + 600, 900]} />
        <meshStandardMaterial map={grass} />
      </mesh>
      {/* avenue */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[length / 2, 0.01, 0]} receiveShadow>
        <planeGeometry args={[length + 60, (ROAD_HALF - 2) * 2]} />
        <meshStandardMaterial map={asphalt} />
      </mesh>
      <instancedMesh ref={laneRef} args={[lane, undefined, laneCount]}>
        <meshBasicMaterial color="#e8d36a" />
      </instancedMesh>
      {/* sidewalks */}
      {[-1, 1].map((s) => (
        <mesh key={s} rotation={[-Math.PI / 2, 0, 0]} position={[length / 2, 0.02, s * (ROAD_HALF - 1)]} receiveShadow>
          <planeGeometry args={[length + 60, 2.2]} />
          <meshStandardMaterial map={pavers} />
        </mesh>
      ))}
      {/* cross streets + crosswalks */}
      {Array.from({ length: blocks }, (_, b) => {
        const x = b * BLOCK_LENGTH + PER_SIDE * (LOT_WIDTH + 2) + CROSS_STREET / 2 - 1;
        return (
          <group key={b}>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.015, 0]} receiveShadow>
              <planeGeometry args={[CROSS_STREET - 4, 120]} />
              <meshStandardMaterial color="#2b2f36" />
            </mesh>
            {[-1, 1].map((s) => (
              <group key={s}>
                {[0, 1, 2, 3, 4].map((i) => (
                  <mesh key={i} rotation={[-Math.PI / 2, 0, 0]} position={[x - 4 + i * 2, 0.035, s * (ROAD_HALF + 0.5)]}>
                    <planeGeometry args={[1, 3.5]} />
                    <meshBasicMaterial color="#f3f4f6" />
                  </mesh>
                ))}
              </group>
            ))}
          </group>
        );
      })}
      {/* street lamps */}
      {Array.from({ length: Math.floor(length / 24) }, (_, i) => (
        <group key={`lamp${i}`} position={[i * 24 + 12, 0, (i % 2 ? 1 : -1) * (ROAD_HALF - 0.6)]}>
          <mesh position={[0, 3, 0]}>
            <cylinderGeometry args={[0.08, 0.12, 6, 5]} />
            <meshStandardMaterial color="#4b5563" />
          </mesh>
          <mesh position={[0, 6, 0]}>
            <sphereGeometry args={[0.35, 8, 8]} />
            <meshStandardMaterial color="#fff6d5" emissive="#ffe9a3" emissiveIntensity={night ? 3 : 0.1} />
          </mesh>
          {night && i % 3 === 0 && <pointLight position={[0, 6, 0]} intensity={25} distance={26} color="#ffe9a3" />}
        </group>
      ))}
      {/* waterfront at the far south */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[length / 2, -0.02, 160]}>
        <planeGeometry args={[length + 600, 200]} />
        <meshStandardMaterial color={night ? "#0e2a4a" : "#3f8fd2"} metalness={0.3} roughness={0.2} />
      </mesh>
    </group>
  );
}

function Trees({ length, blocks }: { length: number; blocks: number }) {
  const n = Math.floor(length / 7) * 2;
  const trunk = useRef<THREE.InstancedMesh>(null);
  const crown = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    if (!trunk.current || !crown.current) return;
    let i = 0;
    for (let k = 0; k < n / 2; k++) {
      for (const s of [-1, 1]) {
        const x = k * 7 + 3 + ((k * 13) % 5);
        const z = s * (ROAD_HALF + LOT_DEPTH + 7 + ((k * 7) % 4));
        const sc = 0.8 + ((k * 31) % 7) / 10;
        tmpObj.position.set(x, 1.2 * sc, z);
        tmpObj.scale.set(sc, sc, sc);
        tmpObj.updateMatrix();
        trunk.current.setMatrixAt(i, tmpObj.matrix);
        tmpObj.position.set(x, 3.2 * sc, z);
        tmpObj.updateMatrix();
        crown.current.setMatrixAt(i, tmpObj.matrix);
        crown.current.setColorAt(i, tmpColor.set(["#2e7d32", "#388e3c", "#43a047", "#2f6f3e"][k % 4]));
        i++;
      }
    }
    trunk.current.instanceMatrix.needsUpdate = true;
    crown.current.instanceMatrix.needsUpdate = true;
    if (crown.current.instanceColor) crown.current.instanceColor.needsUpdate = true;
  }, [n, blocks]);
  return (
    <group>
      <instancedMesh ref={trunk} args={[undefined, undefined, n]} castShadow>
        <cylinderGeometry args={[0.25, 0.35, 2.4, 6]} />
        <meshStandardMaterial color="#6d4c41" />
      </instancedMesh>
      <instancedMesh ref={crown} args={[undefined, undefined, n]} castShadow>
        <dodecahedronGeometry args={[1.8, 0]} />
        <meshStandardMaterial color="#388e3c" />
      </instancedMesh>
    </group>
  );
}

function Cars({ length, night }: { length: number; night: boolean }) {
  const n = Math.max(12, Math.floor(length / 25));
  const ref = useRef<THREE.InstancedMesh>(null);
  const cars = useMemo(
    () =>
      Array.from({ length: n }, (_, i) => ({
        x: (i * 97) % length,
        lane: [-5.5, -2.5, 2.5, 5.5][i % 4],
        speed: (6 + (i % 5) * 1.5) * (i % 4 < 2 ? -1 : 1),
        color: ["#e63946", "#f1faee", "#457b9d", "#ffb703", "#2a9d8f", "#9b5de5", "#222"][i % 7],
        len: 2.6 + (i % 3) * 0.5,
      })),
    [n, length],
  );
  useEffect(() => {
    if (!ref.current) return;
    cars.forEach((c, i) => ref.current!.setColorAt(i, tmpColor.set(c.color)));
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, [cars]);
  useFrame((_, dt) => {
    if (!ref.current) return;
    cars.forEach((c, i) => {
      c.x += c.speed * dt;
      if (c.x > length + 20) c.x = -20;
      if (c.x < -20) c.x = length + 20;
      tmpObj.position.set(c.x, 0.7, c.lane);
      tmpObj.scale.set(c.len / 2.6, 1, 1);
      tmpObj.updateMatrix();
      ref.current!.setMatrixAt(i, tmpObj.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, n]} castShadow>
      <boxGeometry args={[2.6, 1.1, 1.4]} />
      <meshStandardMaterial color="#fff" emissive={night ? "#ffffff" : "#000"} emissiveIntensity={night ? 0.15 : 0} />
    </instancedMesh>
  );
}

function People({ length }: { length: number }) {
  const n = Math.max(10, Math.floor(length / 30));
  const ref = useRef<THREE.InstancedMesh>(null);
  const ppl = useMemo(
    () =>
      Array.from({ length: n }, (_, i) => ({
        x: (i * 53) % length,
        z: (i % 2 ? 1 : -1) * (ROAD_HALF - 1),
        speed: (1 + (i % 3) * 0.4) * (i % 3 ? 1 : -1),
        color: ["#f94144", "#f3722c", "#f9c74f", "#90be6d", "#577590", "#ffffff"][i % 6],
      })),
    [n, length],
  );
  useEffect(() => {
    if (!ref.current) return;
    ppl.forEach((p, i) => ref.current!.setColorAt(i, tmpColor.set(p.color)));
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  }, [ppl]);
  useFrame((state, dt) => {
    if (!ref.current) return;
    ppl.forEach((p, i) => {
      p.x += p.speed * dt;
      if (p.x > length) p.x = 0;
      if (p.x < 0) p.x = length;
      tmpObj.position.set(p.x, 0.9 + Math.abs(Math.sin(state.clock.elapsedTime * 6 + i)) * 0.08, p.z);
      tmpObj.updateMatrix();
      ref.current!.setMatrixAt(i, tmpObj.matrix);
    });
    ref.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, n]}>
      <capsuleGeometry args={[0.28, 0.9, 2, 6]} />
      <meshStandardMaterial color="#fff" />
    </instancedMesh>
  );
}

function EmptyLots({ claimed, upTo }: { claimed: Map<number, unknown>; upTo: number }) {
  const select = useCity((s) => s.select);
  const setHovered = useCity((s) => s.setHovered);
  const hovered = useCity((s) => s.hovered);
  const empties = useMemo(() => {
    const out: number[] = [];
    for (let i = 1; i <= upTo; i++) if (!claimed.has(i)) out.push(i);
    return out;
  }, [claimed, upTo]);
  return (
    <group>
      {empties.map((id) => {
        const pos = plotPosition(id);
        const z = zoneFor(id);
        const tex = signTexture([`PLOT #${id}`, z.minFloors > 1 ? `MIN ${z.minFloors} FLOORS` : "FROM $5", `$${(z.minFloors * 5).toLocaleString()}`], { bg: "#f6f0a0", fg: "#1a1a1a", size: 30, accentBar: "#1a1a1a" });
        const isHover = hovered === id;
        return (
          <group
            key={id}
            position={[pos.x, 0, pos.z]}
            rotation={[0, pos.rotationY, 0]}
            onPointerOver={(e) => {
              e.stopPropagation();
              setHovered(id);
              document.body.style.cursor = "pointer";
            }}
            onPointerOut={() => {
              setHovered(null);
              document.body.style.cursor = "";
            }}
            onClick={(e) => {
              e.stopPropagation();
              select(id);
            }}
          >
            <mesh position={[0, 0.15, 0]} receiveShadow>
              <boxGeometry args={[LOT_WIDTH, 0.3, LOT_DEPTH]} />
              <meshStandardMaterial color={isHover ? "#ffe08a" : "#d8c98a"} />
            </mesh>
            <mesh position={[0, 2.2, -LOT_DEPTH / 2 + 0.6]}>
              <boxGeometry args={[6, 3, 0.2]} />
              <meshBasicMaterial map={tex} />
            </mesh>
            <mesh position={[0, 0.9, -LOT_DEPTH / 2 + 0.6]}>
              <boxGeometry args={[0.3, 1.2, 0.3]} />
              <meshStandardMaterial color="#444" />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

/** Civic landmarks that give the avenue a center: a plaza + fountain, the arcade, the station. */
function Landmarks({ length, night }: { length: number; night: boolean }) {
  const arcadeTex = signTexture(["ARCADE", "coins · prizes"], { bg: "#111827", fg: "#f0abfc", size: 40, accentBar: "#22d3ee" });
  const coasterTex = signTexture(["SKYLINE", "COASTER"], { bg: "#7c2d12", fg: "#fde68a", size: 40, accentBar: "#fde68a" });
  const x0 = Math.min(length - 40, 24 * 12 + 30);
  return (
    <group>
      {/* plaza south of block 0 */}
      <group position={[x0, 0, ROAD_HALF + LOT_DEPTH + 26]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow>
          <circleGeometry args={[14, 32]} />
          <meshStandardMaterial color="#d6d3c4" />
        </mesh>
        <mesh position={[0, 0.6, 0]}>
          <cylinderGeometry args={[4, 4.5, 1, 24]} />
          <meshStandardMaterial color="#9ca3af" />
        </mesh>
        <mesh position={[0, 1.2, 0]}>
          <cylinderGeometry args={[3.2, 3.2, 0.3, 24]} />
          <meshStandardMaterial color={night ? "#1d4ed8" : "#60a5fa"} metalness={0.4} roughness={0.2} />
        </mesh>
        <mesh position={[0, 3.2, 0]}>
          <cylinderGeometry args={[0.3, 0.6, 4, 8]} />
          <meshStandardMaterial color="#e5e7eb" />
        </mesh>
      </group>
      {/* arcade hall */}
      <group position={[x0 + 34, 0, ROAD_HALF + LOT_DEPTH + 22]}>
        <mesh position={[0, 3, 0]} castShadow>
          <boxGeometry args={[18, 6, 12]} />
          <meshStandardMaterial color="#111827" emissive="#22d3ee" emissiveIntensity={night ? 0.5 : 0.08} />
        </mesh>
        <mesh position={[0, 7.5, 0]}>
          <boxGeometry args={[12, 3, 0.3]} />
          <meshBasicMaterial map={arcadeTex} />
        </mesh>
        <pointLight position={[0, 9, 8]} intensity={night ? 60 : 0} color="#f0abfc" distance={40} />
      </group>
      {/* coaster station */}
      <group position={[x0 - 34, 0, ROAD_HALF + LOT_DEPTH + 22]}>
        <mesh position={[0, 2.5, 0]} castShadow>
          <boxGeometry args={[14, 5, 10]} />
          <meshStandardMaterial color="#7c2d12" />
        </mesh>
        <mesh position={[0, 6.5, 0]}>
          <boxGeometry args={[10, 3, 0.3]} />
          <meshBasicMaterial map={coasterTex} />
        </mesh>
        <CoasterTrack length={length} />
      </group>
    </group>
  );
}

export function coasterCurve(length: number): THREE.CatmullRomCurve3 {
  const pts: THREE.Vector3[] = [];
  const steps = 24;
  const x0 = Math.min(length - 40, 24 * 12 + 30) - 34;
  const zBase = ROAD_HALF + LOT_DEPTH + 22;
  pts.push(new THREE.Vector3(x0, 8, zBase));
  pts.push(new THREE.Vector3(x0 - 30, 20, zBase + 10));
  const zOut = ROAD_HALF + LOT_DEPTH + 44;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = t * length;
    const y = 18 + Math.sin(t * Math.PI * 7) * 10 + 8 * Math.sin(t * Math.PI);
    const z = zOut + Math.sin(t * Math.PI * 4) * 8;
    pts.push(new THREE.Vector3(x, Math.max(8, y), z));
  }
  pts.push(new THREE.Vector3(length + 40, 26, zOut + 30));
  pts.push(new THREE.Vector3(length * 0.66, 48, 120));
  pts.push(new THREE.Vector3(length * 0.33, 40, 125));
  pts.push(new THREE.Vector3(x0 - 30, 22, zBase + 40));
  pts.push(new THREE.Vector3(x0, 8, zBase));
  return new THREE.CatmullRomCurve3(pts, true, "catmullrom", 0.4);
}

function CoasterTrack({ length }: { length: number }) {
  const curve = useMemo(() => coasterCurve(length), [length]);
  const geo = useMemo(() => new THREE.TubeGeometry(curve, 400, 0.35, 6, true), [curve]);
  const supports = useMemo(() => curve.getSpacedPoints(60), [curve]);
  const x0 = Math.min(length - 40, 24 * 12 + 30) - 34;
  const zBase = ROAD_HALF + LOT_DEPTH + 22;
  return (
    <group position={[-x0, 0, -zBase]}>
      <mesh geometry={geo}>
        <meshStandardMaterial color="#f97316" metalness={0.5} roughness={0.4} />
      </mesh>
      {supports.filter((p) => p.z < 70).map((p, i) => (
        <mesh key={i} position={[p.x, p.y / 2, p.z]}>
          <cylinderGeometry args={[0.18, 0.25, p.y, 5]} />
          <meshStandardMaterial color="#9a3412" />
        </mesh>
      ))}
    </group>
  );
}

function BlockBillboards({ blocks, billboards, night }: { blocks: number; billboards: Array<{ id: string; slot: string; headline: string; body: string | null; color: string; imageUrl: string | null; plotId: number | null }>; night: boolean }) {
  const setPanel = useCity((s) => s.setPanel);
  return (
    <group>
      {Array.from({ length: blocks }, (_, b) => {
        const x = b * BLOCK_LENGTH + PER_SIDE * (LOT_WIDTH + 2) + CROSS_STREET / 2 - 1;
        const ad = billboards.find((bb) => bb.slot === `block:${b}`);
        const tex = ad
          ? ad.imageUrl && ad.plotId
            ? logoTexture(`/api/logo/${ad.plotId}`)
            : signTexture([ad.headline, ...(ad.body ? [ad.body] : [])], { bg: ad.color, fg: "#fff", size: 28, w: 512, h: 256 })
          : signTexture(["YOUR AD HERE", "from $20 / week"], { bg: "#1f2937", fg: "#fbbf24", size: 34, w: 512, h: 256 });
        return (
          <group
            key={b}
            position={[x, 0, -(ROAD_HALF + LOT_DEPTH + 10)]}
            onClick={(e) => {
              e.stopPropagation();
              if (ad) track({ kind: "billboard", id: ad.id, metric: "opens" });
              setPanel("billboards");
            }}
            onPointerOver={() => (document.body.style.cursor = "pointer")}
            onPointerOut={() => (document.body.style.cursor = "")}
          >
            <mesh position={[0, 9, 0]} castShadow>
              <boxGeometry args={[14, 7, 0.4]} />
              <meshBasicMaterial map={tex} />
            </mesh>
            <mesh position={[-4, 2.5, 0]}>
              <cylinderGeometry args={[0.25, 0.3, 5.5, 6]} />
              <meshStandardMaterial color="#374151" />
            </mesh>
            <mesh position={[4, 2.5, 0]}>
              <cylinderGeometry args={[0.25, 0.3, 5.5, 6]} />
              <meshStandardMaterial color="#374151" />
            </mesh>
            {night && <pointLight position={[0, 13, 4]} intensity={30} distance={22} color="#fff7d6" />}
          </group>
        );
      })}
    </group>
  );
}

function Airship({ length, billboards }: { length: number; billboards: Array<{ id: string; slot: string; headline: string; color: string }> }) {
  const ref = useRef<THREE.Group>(null);
  const ad = billboards.find((b) => b.slot === "airship");
  const tex = signTexture([ad ? ad.headline : "FLY YOUR BANNER HERE"], { bg: ad ? ad.color : "#fff", fg: ad ? "#fff" : "#111", size: 36, w: 1024, h: 160 });
  const setPanel = useCity((s) => s.setPanel);
  useFrame((state) => {
    if (!ref.current) return;
    const t = (state.clock.elapsedTime * 4) % (length + 160);
    ref.current.position.set(t - 80, 70 + Math.sin(state.clock.elapsedTime * 0.5) * 2, -40);
  });
  return (
    <group
      ref={ref}
      onClick={(e) => {
        e.stopPropagation();
        if (ad) track({ kind: "billboard", id: ad.id, metric: "opens" });
        setPanel("billboards");
      }}
    >
      <mesh castShadow>
        <capsuleGeometry args={[4, 14, 4, 12]} />
        <meshStandardMaterial color="#f8fafc" />
      </mesh>
      <mesh position={[0, -4.5, 0]}>
        <boxGeometry args={[6, 2, 2.5]} />
        <meshStandardMaterial color="#334155" />
      </mesh>
      <mesh position={[-28, -2, 0]}>
        <planeGeometry args={[36, 5.6]} />
        <meshBasicMaterial map={tex} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/** Ghost building shown while a buyer designs their claim. */
function PreviewBuilding() {
  const draft = useCity((s) => s.previewDraft);
  const night = useCity((s) => s.night);
  if (!draft) return null;
  return (
    <Building
      plot={{ id: draft.plotId, name: "Your building", tagline: null, website: null, hasLogo: false, color: draft.color, accent: "#fff", style: draft.style, shape: draft.shape, floors: draft.floors, roof: draft.roof, district: "downtown", tier: "free", valueCents: draft.floors * 500, totalViews: 0, totalClicks: 0, claimedAt: null, salesCount: 0 }}
      night={night}
      hovered={false}
      selected
    />
  );
}

function CameraRig({ length }: { length: number }) {
  const controls = useRef<OrbitControlsImpl>(null);
  const { camera } = useThree();
  const flyTo = useCity((s) => s.flyTo);
  const setFlyTo = useCity((s) => s.setFlyTo);
  const ride = useCity((s) => s.ride);
  const setRide = useCity((s) => s.setRide);
  const plots = useCity((s) => s.plots);
  const curve = useMemo(() => coasterCurve(length), [length]);
  const rideT = useRef(0);
  const target = useRef<{ pos: THREE.Vector3; look: THREE.Vector3 } | null>(null);

  useEffect(() => {
    if (flyTo == null) return;
    const p = plotPosition(flyTo);
    const plot = plots.get(flyTo);
    const h = plot ? heightForValue(plot.valueCents, plot.tier) : 6;
    // Stand across the avenue from the building, high enough to see the roof, far enough to clear neighbours.
    // Empty lots sit among towers, so look down at them from higher up.
    const dist = plot ? 55 + h * 0.9 : 42;
    const y = plot ? Math.max(38, h * 0.85 + 28) : 64;
    target.current = { look: new THREE.Vector3(p.x, h * 0.45, p.z), pos: new THREE.Vector3(p.x + 18, y, p.z - p.side * dist) };
    setFlyTo(null);
  }, [flyTo, plots, setFlyTo]);

  useEffect(() => {
    if (ride) rideT.current = 0;
  }, [ride]);

  useFrame((_, dt) => {
    if (ride) {
      rideT.current += dt / 48;
      if (rideT.current >= 1) {
        setRide(false);
        return;
      }
      const p = curve.getPointAt(rideT.current);
      const ahead = curve.getPointAt((rideT.current + 0.004) % 1);
      camera.position.lerp(p, 0.4);
      camera.lookAt(ahead);
      return;
    }
    if (target.current && controls.current) {
      camera.position.lerp(target.current.pos, Math.min(1, dt * 3));
      controls.current.target.lerp(target.current.look, Math.min(1, dt * 3));
      if (camera.position.distanceTo(target.current.pos) < 0.5) target.current = null;
    }
    controls.current?.update();
  });

  // keyboard pan
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!controls.current || (e.target as HTMLElement)?.tagName === "INPUT" || (e.target as HTMLElement)?.tagName === "TEXTAREA") return;
      const step = 12;
      const dir = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step], a: [-step, 0], d: [step, 0], w: [0, -step], s: [0, step] }[e.key] as [number, number] | undefined;
      if (!dir) return;
      controls.current.target.x += dir[0];
      controls.current.target.z += dir[1];
      camera.position.x += dir[0];
      camera.position.z += dir[1];
      target.current = null;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [camera]);

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enabled={!ride}
      enableDamping
      dampingFactor={0.08}
      minDistance={18}
      maxDistance={420}
      maxPolarAngle={Math.PI / 2.15}
      minPolarAngle={0.25}
      target={[80, 4, 0]}
      panSpeed={1.2}
      screenSpacePanning={false}
    />
  );
}

/** Reports which buildings were on screen; owners see this as "impressions". */
function Impressions() {
  const { camera } = useThree();
  const plots = useCity((s) => s.plots);
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
    for (const p of plots.values()) {
      if (seen.current.has(p.id)) continue;
      const pos = plotPosition(p.id);
      const v = new THREE.Vector3(pos.x, 8, pos.z);
      if (frustum.containsPoint(v) && camera.position.distanceTo(v) < 260) {
        seen.current.add(p.id);
        fresh.push(p.id);
      }
    }
    if (fresh.length) track({ kind: "impressions", plotIds: fresh });
  });
  return null;
}
