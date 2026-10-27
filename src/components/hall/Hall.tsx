"use client";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { ceilingTexture, floorTexture, glassTexture, ledTexture, ribbedTexture, signTexture, wallTexture } from "./textures";
import { TwoSided } from "./Booth";
import { AISLE_W, ARCADE, BACK, CEILING, EXHIBIT_AISLES, AA_AISLES, FRONT, HALLS, HALL_DEPTH, HALL_LENGTH, HALF_DEPTH, PITCH, SLOT, X0, Z0, Z_CROSS0, Z_CROSS1, Z_FRONT, Z_BACK, CROSS } from "@/lib/hall/layout";

const tmp = new THREE.Object3D();
const col = new THREE.Color();
type Inst = React.RefObject<THREE.InstancedMesh | null>;
/** Write one instance transform (y rotation, then x rotation). */
function put(ref: Inst, i: number, x: number, y: number, z: number, ry = 0, rx = 0) {
  if (!ref.current) return;
  tmp.position.set(x, y, z); tmp.rotation.set(rx, ry, 0); tmp.scale.set(1, 1, 1); tmp.updateMatrix();
  ref.current.setMatrixAt(i, tmp.matrix);
}
const flush = (...refs: Inst[]) => refs.forEach((r) => { if (!r.current) return; r.current.instanceMatrix.needsUpdate = true; if (r.current.instanceColor) r.current.instanceColor.needsUpdate = true; });

const AISLES = EXHIBIT_AISLES + AA_AISLES;
const TRUSS_ROWS = Math.floor(HALL_DEPTH / 30);
const TRUSS_COLS = Math.floor(HALL_LENGTH / 30);
const TRUSS = 2.2; // box-truss section
const TRUSS_Y = CEILING - TRUSS / 2 - 0.2;
const FIXTURE_Y = TRUSS_Y - TRUSS / 2 - 0.45;
/** Entrance doors along the front wall, loading docks along the back wall. */
const DOORS = Array.from({ length: 9 }, (_, i) => X0 + 60 + i * ((HALL_LENGTH - 120) / 8));
const DOCKS = Array.from({ length: 6 }, (_, i) => X0 + 95 + i * ((HALL_LENGTH - 190) / 5));
const PILLAR_COUNT = (Math.floor(AISLES / 4) + 1) * 2;
const CAN_COLORS = ["#ff2bd6", "#00e5ff", "#ffd166", "#5ee6c3", "#ff6b6b", "#8f7bff"];

/** A lattice box truss along x: four chords and a zig-zag of diagonals on both sides and the underside. */
function trussGeometry(length: number, size: number, step: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const t = 0.22, h = size / 2, d = t * 0.8;
  for (const [y, z] of [[h, h], [h, -h], [-h, h], [-h, -h]]) parts.push(new THREE.BoxGeometry(length, t, t).translate(0, y, z));
  const n = Math.floor(length / step), diag = Math.hypot(step, size), ang = Math.atan2(size, step);
  for (let i = 0; i < n; i++) {
    const x = -length / 2 + step * (i + 0.5), s = i % 2 ? 1 : -1;
    for (const z of [h, -h]) parts.push(new THREE.BoxGeometry(diag, d, d).rotateZ(s * ang).translate(x, 0, z));
    parts.push(new THREE.BoxGeometry(diag, d, d).rotateY(s * ang).translate(x, -h, 0));
  }
  const g = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return g;
}

/** The building: floor, carpet, walls, ceiling trusses, lights, entrance, hanging signs. */
export function Hall({ night }: { night: boolean }) {
  const slab = useMemo(() => floorTexture("concrete", [HALL_LENGTH / 12, HALL_DEPTH / 12]), []);
  const frontFloor = useMemo(() => floorTexture("polished", [HALL_LENGTH / 12, (FRONT - 2) / 12]), []);
  const backFloor = useMemo(() => floorTexture("polished", [HALL_LENGTH / 12, (BACK - 2) / 12]), []);
  const carpet = useMemo(() => floorTexture("carpet", [1, HALF_DEPTH / 10]), []);
  const runner = useMemo(() => floorTexture("cross", [HALL_LENGTH / 8, CROSS / 8]), []);
  const wallLong = useMemo(() => wallTexture((HALL_LENGTH + 4) / 80), []);
  const wallEnd = useMemo(() => wallTexture((HALL_DEPTH + 4) / 80), []);
  const roofSign = useMemo(() => signTexture(["FOREVERCOMICCON", "EXHIBIT HALL"], { bg: "#0b0f1a", fg: "#ffd166", w: 1024, h: 256, size: 86 }), []);
  const carpets = useRef<THREE.InstancedMesh>(null);
  const pillars = useRef<THREE.InstancedMesh>(null);
  const bases = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    // aisle carpets: two runs per aisle that stop at the cross aisle, so no two carpets ever overlap
    let i = 0;
    for (let a = 0; a < AISLES; a++) for (const zc of [(Z_FRONT + Z_CROSS0) / 2, (Z_CROSS1 + Z_BACK) / 2]) {
      put(carpets, i, X0 + a * PITCH + SLOT + AISLE_W / 2, 0.02, zc, 0, -Math.PI / 2);
      carpets.current?.setColorAt(i, col.set(a >= EXHIBIT_AISLES ? "#8b5cf6" : "#2a4cc0"));
      i++;
    }
    let p = 0;
    for (let c = 0; c <= AISLES; c += 4) for (const z of [Z_FRONT - 4, Z_BACK + 4]) { const x = X0 + c * PITCH + SLOT; put(pillars, p, x, CEILING / 2, z); put(bases, p, x, 0.6, z); p++; }
    flush(carpets, pillars, bases);
  }, []);
  const wallTint = night ? "#4a5578" : "#ffffff";
  const floorTint = night ? "#767c8a" : "#ffffff";
  return (
    <group>
      {/* the slab under everything */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[HALL_LENGTH + 2, HALL_DEPTH + 2]} />
        <meshStandardMaterial map={slab} color={night ? "#6a707c" : "#ffffff"} roughness={0.95} />
      </mesh>
      {/* aisle carpets (instanced; the Artists' Alley aisles are tinted purple) */}
      <instancedMesh frustumCulled={false} ref={carpets} args={[undefined, undefined, AISLES * 2]}>
        <planeGeometry args={[AISLE_W, HALF_DEPTH]} />
        <meshStandardMaterial map={carpet} color={night ? "#8e9bf2" : "#ffffff"} roughness={1} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
      </instancedMesh>
      {/* the woven red runner down the cross aisle */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, (Z_CROSS0 + Z_CROSS1) / 2]}>
        <planeGeometry args={[HALL_LENGTH, CROSS]} />
        <meshStandardMaterial map={runner} color={night ? "#8a8aa8" : "#ffffff"} roughness={1} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
      </mesh>
      {/* polished concrete concourses at the entrance and along the back wall */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, Z0 + FRONT / 2]}>
        <planeGeometry args={[HALL_LENGTH, FRONT - 2]} />
        <meshStandardMaterial map={frontFloor} color={floorTint} roughness={0.55} metalness={0.05} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, Z_BACK + BACK / 2]}>
        <planeGeometry args={[HALL_LENGTH, BACK - 2]} />
        <meshStandardMaterial map={backFloor} color={night ? "#5e6472" : "#d9d7d2"} roughness={0.6} metalness={0.05} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
      </mesh>
      {/* walls: plain outer shells (what the overview sees) and panelled inner faces */}
      {([[0, Z0 - 1, HALL_LENGTH + 4, 2], [0, Z0 + HALL_DEPTH + 1, HALL_LENGTH + 4, 2], [X0 - 1, 0, 2, HALL_DEPTH + 4], [X0 + HALL_LENGTH + 1, 0, 2, HALL_DEPTH + 4]] as const).map(([x, z, w, d], i) => (
        <mesh key={i} position={[x, CEILING / 2, z]}>
          <boxGeometry args={[w, CEILING, d]} />
          <meshStandardMaterial color={night ? "#10141f" : "#2a3040"} roughness={0.9} />
        </mesh>
      ))}
      {([[0, Z0 + 0.03, 0, wallLong, HALL_LENGTH + 4], [0, Z0 + HALL_DEPTH - 0.03, Math.PI, wallLong, HALL_LENGTH + 4], [X0 + 0.03, 0, Math.PI / 2, wallEnd, HALL_DEPTH + 4], [X0 + HALL_LENGTH - 0.03, 0, -Math.PI / 2, wallEnd, HALL_DEPTH + 4]] as const).map(([x, z, ry, tex, w], i) => (
        <mesh key={i} position={[x, CEILING / 2, z]} rotation={[0, ry, 0]}>
          <planeGeometry args={[w, CEILING]} />
          <meshStandardMaterial map={tex} color={wallTint} roughness={0.85} />
        </mesh>
      ))}
      {/* brand stripe along the chair rail of both long walls: a light line at night */}
      {[Z0 + 0.2, Z0 + HALL_DEPTH - 0.2].map((z) => (
        <mesh key={z} position={[0, 7.3, z]}>
          <boxGeometry args={[HALL_LENGTH, 0.5, 0.3]} />
          <meshStandardMaterial color="#ffd166" emissive="#ffd166" emissiveIntensity={night ? 1.3 : 0.35} />
        </mesh>
      ))}
      {/* roof sign over the entrance, read from the map view */}
      <group position={[0, CEILING + 0.1 + 37 / 2, Z0 + 1.2]}><TwoSided w={150} h={37}><meshBasicMaterial map={roofSign} toneMapped={false} /></TwoSided></group>
      <Entrances night={night} />
      <Docks night={night} />
      <CeilingRig night={night} />
      {/* structural columns along both concourses */}
      <instancedMesh frustumCulled={false} ref={pillars} args={[undefined, undefined, PILLAR_COUNT]}>
        <cylinderGeometry args={[1.4, 1.4, CEILING, 14]} />
        <meshStandardMaterial color={night ? "#6b7384" : "#a3abb8"} roughness={0.55} metalness={0.15} />
      </instancedMesh>
      <instancedMesh frustumCulled={false} ref={bases} args={[undefined, undefined, PILLAR_COUNT]}>
        <cylinderGeometry args={[1.9, 2.2, 1.2, 14]} />
        <meshStandardMaterial color={night ? "#2b3140" : "#4b5361"} roughness={0.7} />
      </instancedMesh>
      <HangingSigns night={night} />
    </group>
  );
}

/** The front wall: nine glass entrances with mullioned doors, a lit header, a canopy with downlights, an exit sign and backlit poster boxes. */
function Entrances({ night }: { night: boolean }) {
  const glass = useMemo(() => glassTexture(night), [night]);
  const poster = useMemo(() => signTexture(["FOREVER", "COMIC CON", "", "EXHIBIT HALL", "open 24 / 7"], { bg: "#0f172a", fg: "#ffd166", w: 256, h: 352, size: 42 }), []);
  const exit = useMemo(() => signTexture(["EXIT"], { bg: "#14532d", fg: "#dcfce7", w: 192, h: 72, size: 52 }), []);
  const headers = useMemo(() => DOORS.map((_, i) => signTexture([`ENTRANCE ${i + 1}`], { bg: "#0f1b3d", fg: "#ffffff", w: 1024, h: 112, size: 72, accentBar: "#ffd166" })), []);
  const frames = useRef<THREE.InstancedMesh>(null);
  const panes = useRef<THREE.InstancedMesh>(null);
  const canopies = useRef<THREE.InstancedMesh>(null);
  const soffits = useRef<THREE.InstancedMesh>(null);
  const exits = useRef<THREE.InstancedMesh>(null);
  const boxes = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    DOORS.forEach((x, i) => {
      put(frames, i, x, 8.5, Z0 + 0.5);
      put(panes, i, x, 7, Z0 + 1.03);
      put(canopies, i, x, 17.75, Z0 + 3.5);
      put(exits, i, x, 16.6, Z0 + 6.4);
      [-8, 0, 8].forEach((dx, k) => put(soffits, i * 3 + k, x + dx, 17.44, Z0 + 4.2));
      [-16.8, 16.8].forEach((dx, k) => put(boxes, i * 2 + k, x + dx, 6.2, Z0 + 0.48));
    });
    flush(frames, panes, canopies, exits, soffits, boxes);
  }, []);
  const n = DOORS.length;
  return (
    <group>
      <instancedMesh frustumCulled={false} ref={frames} args={[undefined, undefined, n]}>
        <boxGeometry args={[26, 17, 1]} />
        <meshStandardMaterial color="#1a1f2a" metalness={0.5} roughness={0.45} />
      </instancedMesh>
      <instancedMesh frustumCulled={false} ref={panes} args={[undefined, undefined, n]}>
        <planeGeometry args={[22, 14]} />
        <meshStandardMaterial map={glass} emissiveMap={glass} emissive="#ffffff" emissiveIntensity={night ? 1.1 : 0.08} metalness={0.25} roughness={0.18} />
      </instancedMesh>
      {DOORS.map((x, i) => (
        <mesh key={i} position={[x, 15.4, Z0 + 1.2]}>
          <boxGeometry args={[22, 2.3, 0.35]} />
          <meshStandardMaterial map={headers[i]} emissiveMap={headers[i]} emissive="#ffffff" emissiveIntensity={night ? 0.9 : 0.3} />
        </mesh>
      ))}
      <instancedMesh frustumCulled={false} ref={canopies} args={[undefined, undefined, n]}>
        <boxGeometry args={[28, 0.5, 7]} />
        <meshStandardMaterial color={night ? "#1a1f2a" : "#262c38"} roughness={0.6} metalness={0.3} />
      </instancedMesh>
      <instancedMesh frustumCulled={false} ref={soffits} args={[undefined, undefined, n * 3]}>
        <cylinderGeometry args={[0.55, 0.55, 0.12, 12]} />
        <meshStandardMaterial color="#fff6e0" emissive="#fff1d0" emissiveIntensity={night ? 2.2 : 1.4} toneMapped={false} />
      </instancedMesh>
      <instancedMesh frustumCulled={false} ref={exits} args={[undefined, undefined, n]}>
        <boxGeometry args={[2.6, 1, 0.25]} />
        <meshStandardMaterial map={exit} emissiveMap={exit} emissive="#ffffff" emissiveIntensity={night ? 1.4 : 0.8} toneMapped={false} />
      </instancedMesh>
      <instancedMesh frustumCulled={false} ref={boxes} args={[undefined, undefined, n * 2]}>
        <boxGeometry args={[4.6, 6.3, 0.35]} />
        <meshStandardMaterial map={poster} emissiveMap={poster} emissive="#ffffff" emissiveIntensity={night ? 0.9 : 0.25} />
      </instancedMesh>
    </group>
  );
}

/** Roll-up dock doors along the back wall, each with its number. */
function Docks({ night }: { night: boolean }) {
  const ribbed = useMemo(() => ribbedTexture("#4b5361", [3.5, 3]), []);
  const labels = useMemo(() => DOCKS.map((_, i) => signTexture([`DOCK ${i + 1}`], { bg: "#1f2937", fg: "#ffd166", w: 512, h: 112, size: 64 })), []);
  const doors = useRef<THREE.InstancedMesh>(null);
  useEffect(() => { DOCKS.forEach((x, i) => put(doors, i, x, 6, Z0 + HALL_DEPTH - 0.25)); flush(doors); }, []);
  return (
    <group>
      <instancedMesh frustumCulled={false} ref={doors} args={[undefined, undefined, DOCKS.length]}>
        <boxGeometry args={[14, 12, 0.4]} />
        <meshStandardMaterial map={ribbed} color={night ? "#5b6478" : "#ffffff"} metalness={0.45} roughness={0.55} />
      </instancedMesh>
      {DOCKS.map((x, i) => (
        <mesh key={i} position={[x, 13.6, Z0 + HALL_DEPTH - 0.3]} rotation={[0, Math.PI, 0]}>
          <planeGeometry args={[10, 2.2]} />
          <meshStandardMaterial map={labels[i]} emissiveMap={labels[i]} emissive="#ffffff" emissiveIntensity={night ? 0.7 : 0.2} />
        </mesh>
      ))}
    </group>
  );
}

/** Ceiling deck, aluminium box trusses, LED wash fixtures at every truss crossing and par cans mid-span. Hidden while the camera is above the roof so the map view stays clean. */
function CeilingRig({ night }: { night: boolean }) {
  const group = useRef<THREE.Group>(null);
  useFrame(({ camera }) => { if (group.current) group.current.visible = camera.position.y < CEILING - 1; });
  const deck = useMemo(() => ceilingTexture([HALL_LENGTH / 8, HALL_DEPTH / 8]), []);
  const led = useMemo(() => ledTexture(), []);
  const rowTruss = useMemo(() => trussGeometry(HALL_LENGTH, TRUSS, 6), []);
  const colTruss = useMemo(() => trussGeometry(HALL_DEPTH, TRUSS, 6).rotateY(Math.PI / 2), []);
  const rows = useRef<THREE.InstancedMesh>(null);
  const cols = useRef<THREE.InstancedMesh>(null);
  const housings = useRef<THREE.InstancedMesh>(null);
  const lenses = useRef<THREE.InstancedMesh>(null);
  const cans = useRef<THREE.InstancedMesh>(null);
  const gels = useRef<THREE.InstancedMesh>(null);
  const canCount = TRUSS_ROWS * (TRUSS_COLS - 1);
  useEffect(() => {
    for (let r = 0; r < TRUSS_ROWS; r++) put(rows, r, 0, TRUSS_Y, Z0 + 15 + r * 30);
    for (let c = 0; c < TRUSS_COLS; c++) put(cols, c, X0 + 15 + c * 30, TRUSS_Y, 0);
    let i = 0, k = 0;
    for (let r = 0; r < TRUSS_ROWS; r++) for (let c = 0; c < TRUSS_COLS; c++) {
      const x = X0 + 15 + c * 30, z = Z0 + 15 + r * 30;
      put(housings, i, x, FIXTURE_Y, z); put(lenses, i, x, FIXTURE_Y - 0.42, z); i++;
      if (c < TRUSS_COLS - 1) {
        const y = TRUSS_Y - TRUSS / 2 - 0.85;
        put(cans, k, x + 15, y, z); put(gels, k, x + 15, y - 0.78, z);
        gels.current?.setColorAt(k, col.set(CAN_COLORS[(r + k) % CAN_COLORS.length]));
        k++;
      }
    }
    flush(rows, cols, housings, lenses, cans, gels);
  }, []);
  return (
    <group ref={group}>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, CEILING, 0]}>
        <planeGeometry args={[HALL_LENGTH + 4, HALL_DEPTH + 4]} />
        <meshStandardMaterial map={deck} color={night ? "#2f3648" : "#ffffff"} roughness={0.9} />
      </mesh>
      <instancedMesh frustumCulled={false} ref={rows} geometry={rowTruss} args={[undefined, undefined, TRUSS_ROWS]}>
        <meshStandardMaterial color={night ? "#8a93a3" : "#c9ced8"} metalness={0.8} roughness={0.3} />
      </instancedMesh>
      <instancedMesh frustumCulled={false} ref={cols} geometry={colTruss} args={[undefined, undefined, TRUSS_COLS]}>
        <meshStandardMaterial color={night ? "#8a93a3" : "#c9ced8"} metalness={0.8} roughness={0.3} />
      </instancedMesh>
      <instancedMesh frustumCulled={false} ref={housings} args={[undefined, undefined, TRUSS_ROWS * TRUSS_COLS]}>
        <boxGeometry args={[6.6, 0.7, 2.6]} />
        <meshStandardMaterial color="#262b35" metalness={0.5} roughness={0.5} />
      </instancedMesh>
      <instancedMesh frustumCulled={false} ref={lenses} args={[undefined, undefined, TRUSS_ROWS * TRUSS_COLS]}>
        <boxGeometry args={[6, 0.12, 2]} />
        <meshStandardMaterial map={led} emissiveMap={led} emissive={night ? "#ffcf8a" : "#ffffff"} emissiveIntensity={night ? 1.4 : 2.4} toneMapped={false} />
      </instancedMesh>
      <instancedMesh frustumCulled={false} ref={cans} args={[undefined, undefined, canCount]}>
        <cylinderGeometry args={[0.55, 0.62, 1.5, 10]} />
        <meshStandardMaterial color="#1f232b" metalness={0.6} roughness={0.4} />
      </instancedMesh>
      <instancedMesh frustumCulled={false} ref={gels} args={[undefined, undefined, canCount]}>
        <cylinderGeometry args={[0.46, 0.46, 0.1, 10]} />
        <meshBasicMaterial color={night ? "#ffffff" : "#d9dde6"} toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

/** Hall letters over the front concourse, aisle numbers over every aisle, Artists' Alley and Arcade marquees. */
function HangingSigns({ night }: { night: boolean }) {
  const hallSigns = useMemo(() => HALLS.map((h) => signTexture([`HALL ${h}`], { bg: "#111827", fg: "#ffffff", w: 1024, h: 320, size: 230, accentBar: "#ffd166" })), []);
  const aisleSigns = useMemo(() => Array.from({ length: EXHIBIT_AISLES }, (_, a) => signTexture([String((a + 1) * 100)], { bg: "#1d4ed8", fg: "#ffffff", w: 512, h: 256, size: 196, accentBar: "#93c5fd" })), []);
  const aaSign = useMemo(() => signTexture(["ARTISTS' ALLEY"], { bg: "#7c3aed", fg: "#ffffff", w: 1024, h: 208, size: 130 }), []);
  const arcadeSign = useMemo(() => signTexture(["ARCADE"], { bg: "#0a0a14", fg: "#ff2bd6", w: 1024, h: 256, size: 150, dy: 0.07 }), []);
  const hallW = HALL_LENGTH / HALLS.length;
  return (
    <group>
      {hallSigns.map((t, i) => (
        <group key={i} position={[X0 + hallW * (i + 0.5), CEILING - 9, Z_FRONT - 12]}>
          <TwoSided w={32} h={10}><meshBasicMaterial map={t} toneMapped={false} /></TwoSided>
          {[-14, 14].map((x) => <mesh key={x} position={[x, 7, 0]}><cylinderGeometry args={[0.12, 0.12, 10, 4]} /><meshStandardMaterial color="#9ca3af" /></mesh>)}
        </group>
      ))}
      {aisleSigns.map((t, a) => (
        <group key={a} position={[X0 + a * PITCH + SLOT + AISLE_W / 2, CEILING - 12, Z_FRONT - 3]}>
          <TwoSided w={9} h={4.5}><meshBasicMaterial map={t} toneMapped={false} /></TwoSided>
          <mesh position={[0, 7, 0]}><cylinderGeometry args={[0.1, 0.1, 10, 4]} /><meshStandardMaterial color="#9ca3af" /></mesh>
        </group>
      ))}
      <group position={[X0 + EXHIBIT_AISLES * PITCH + (AA_AISLES * PITCH) / 2, CEILING - 7, Z_FRONT - 12]}>
        <TwoSided w={70} h={14}><meshBasicMaterial map={aaSign} toneMapped={false} /></TwoSided>
      </group>
      <group position={[ARCADE.x, CEILING - 6, ARCADE.z - ARCADE.d / 2 - 2]}>
        <TwoSided w={60} h={15}><meshBasicMaterial map={arcadeSign} toneMapped={false} /></TwoSided>
        {night && <pointLight position={[0, -4, 6]} intensity={400} distance={90} color="#ff2bd6" />}
      </group>
    </group>
  );
}
