"use client";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { floorTexture, signTexture } from "./textures";
import { TwoSided } from "./Booth";
import { AISLE_W, ARCADE, BACK, CEILING, EXHIBIT_AISLES, AA_AISLES, FRONT, HALLS, HALL_DEPTH, HALL_LENGTH, PITCH, SLOT, X0, Z0, Z_CROSS0, Z_CROSS1, Z_FRONT, Z_BACK, CROSS } from "@/lib/hall/layout";

const tmp = new THREE.Object3D();

/** The building: floor, carpet, walls, ceiling trusses, lights, entrance, hanging signs. */
export function Hall({ night }: { night: boolean }) {
  const concrete = useMemo(() => floorTexture("concrete", [HALL_LENGTH / 12, HALL_DEPTH / 12]), []);
  const carpet = useMemo(() => floorTexture("carpet", [1, 8]), []);
  const cross = useMemo(() => floorTexture("cross", [HALL_LENGTH / 10, 2]), []);
  const aisleCount = EXHIBIT_AISLES + AA_AISLES;
  const trussRows = Math.floor(HALL_DEPTH / 30);
  const trussCols = Math.floor(HALL_LENGTH / 30);
  const lightRef = useRef<THREE.InstancedMesh>(null);
  const trussRef = useRef<THREE.InstancedMesh>(null);
  const trussRef2 = useRef<THREE.InstancedMesh>(null);
  const pillarRef = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    if (!lightRef.current || !trussRef.current || !trussRef2.current || !pillarRef.current) return;
    let i = 0;
    for (let r = 0; r < trussRows; r++) for (let c = 0; c < trussCols; c++) {
      tmp.position.set(X0 + 15 + c * 30, CEILING - 2.2, Z0 + 15 + r * 30); tmp.rotation.set(0, 0, 0); tmp.scale.set(1, 1, 1); tmp.updateMatrix();
      lightRef.current.setMatrixAt(i++, tmp.matrix);
    }
    lightRef.current.instanceMatrix.needsUpdate = true;
    for (let r = 0; r < trussRows; r++) { tmp.position.set(0, CEILING - 1, Z0 + 15 + r * 30); tmp.updateMatrix(); trussRef.current.setMatrixAt(r, tmp.matrix); }
    trussRef.current.instanceMatrix.needsUpdate = true;
    for (let c = 0; c < trussCols; c++) { tmp.position.set(X0 + 15 + c * 30, CEILING - 1, 0); tmp.updateMatrix(); trussRef2.current.setMatrixAt(c, tmp.matrix); }
    trussRef2.current.instanceMatrix.needsUpdate = true;
    let p = 0;
    for (let c = 0; c <= aisleCount; c += 4) for (const z of [Z_FRONT - 4, Z_BACK + 4]) { tmp.position.set(X0 + c * PITCH + SLOT, CEILING / 2, z); tmp.updateMatrix(); pillarRef.current.setMatrixAt(p++, tmp.matrix); }
    pillarRef.current.instanceMatrix.needsUpdate = true;
  }, [trussRows, trussCols, aisleCount]);
  const pillarCount = (Math.floor(aisleCount / 4) + 1) * 2;
  const wall = night ? "#141a2a" : "#2b3140";
  const entranceSign = useMemo(() => signTexture(["FOREVERCOMICCON", "EXHIBIT HALL"], { bg: "#0b0f1a", fg: "#ffd166", w: 1024, h: 256, size: 86 }), []);
  return (
    <group>
      {/* floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[HALL_LENGTH + 2, HALL_DEPTH + 2]} />
        <meshStandardMaterial map={concrete} color={night ? "#8a8f9a" : "#ffffff"} roughness={0.95} />
      </mesh>
      {/* aisle carpets */}
      {Array.from({ length: aisleCount }, (_, a) => (
        <mesh key={a} rotation={[-Math.PI / 2, 0, 0]} position={[X0 + a * PITCH + SLOT + AISLE_W / 2, 0.02, (Z_FRONT + Z_BACK) / 2]}>
          <planeGeometry args={[AISLE_W, Z_BACK - Z_FRONT]} />
          <meshStandardMaterial map={carpet} color={a >= EXHIBIT_AISLES ? "#b06ad8" : night ? "#9aa8ff" : "#ffffff"} roughness={1} />
        </mesh>
      ))}
      {/* cross aisle + concourses */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, (Z_CROSS0 + Z_CROSS1) / 2]}>
        <planeGeometry args={[HALL_LENGTH, CROSS]} />
        <meshStandardMaterial map={cross} roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, Z0 + FRONT / 2]}>
        <planeGeometry args={[HALL_LENGTH, FRONT - 2]} />
        <meshStandardMaterial map={cross} roughness={1} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, Z_BACK + BACK / 2]}>
        <planeGeometry args={[HALL_LENGTH, BACK - 2]} />
        <meshStandardMaterial color={night ? "#3b4252" : "#6b7280"} roughness={1} />
      </mesh>
      {/* walls */}
      {([[0, Z0 - 1, HALL_LENGTH + 4, 2, 0], [0, Z0 + HALL_DEPTH + 1, HALL_LENGTH + 4, 2, 0], [X0 - 1, 0, 2, HALL_DEPTH + 4, 0], [X0 + HALL_LENGTH + 1, 0, 2, HALL_DEPTH + 4, 0]] as const).map(([x, z, w, d], i) => (
        <mesh key={i} position={[x, CEILING / 2, z]}>
          <boxGeometry args={[w, CEILING, d]} />
          <meshStandardMaterial color={wall} roughness={0.9} side={THREE.DoubleSide} />
        </mesh>
      ))}
      {/* wall stripe */}
      <mesh position={[0, 3, Z0 - 0.0]}>
        <boxGeometry args={[HALL_LENGTH, 6, 0.4]} />
        <meshStandardMaterial color="#ffd166" />
      </mesh>
      {/* entrances along the front wall */}
      {Array.from({ length: 9 }, (_, i) => X0 + 60 + i * ((HALL_LENGTH - 120) / 8)).map((x, i) => (
        <group key={i} position={[x, 0, Z0 + 0.1]}>
          <mesh position={[0, 7, 0]}>
            <boxGeometry args={[22, 14, 1.2]} />
            <meshStandardMaterial color="#9fb3c8" metalness={0.5} roughness={0.2} emissive="#dbe7ff" emissiveIntensity={night ? 0.5 : 0.15} />
          </mesh>
          <mesh position={[0, 15.5, 0.8]}>
            <boxGeometry args={[24, 2.2, 0.6]} />
            <meshStandardMaterial color="#e63946" />
          </mesh>
        </group>
      ))}
      <group position={[0, 24, Z0 + 1.2]}><TwoSided w={150} h={37}><meshBasicMaterial map={entranceSign} toneMapped={false} /></TwoSided></group>
      <CeilingRig night={night} trussRows={trussRows} trussCols={trussCols} refs={{ trussRef, trussRef2, lightRef }} />
      <instancedMesh ref={pillarRef} args={[undefined, undefined, pillarCount]}>
        <cylinderGeometry args={[1.4, 1.4, CEILING, 10]} />
        <meshStandardMaterial color="#8a93a3" roughness={0.6} />
      </instancedMesh>
      <HangingSigns night={night} />
    </group>
  );
}

/** Ceiling, trusses and light fixtures. Hidden while the camera is above the roof so the map view stays clean. */
function CeilingRig({ night, trussRows, trussCols, refs }: { night: boolean; trussRows: number; trussCols: number; refs: { trussRef: React.RefObject<THREE.InstancedMesh | null>; trussRef2: React.RefObject<THREE.InstancedMesh | null>; lightRef: React.RefObject<THREE.InstancedMesh | null> } }) {
  const group = useRef<THREE.Group>(null);
  useFrame(({ camera }) => { if (group.current) group.current.visible = camera.position.y < CEILING - 1; });
  const { trussRef, trussRef2, lightRef } = refs;
  return (
    <group ref={group}>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, CEILING, 0]}>
        <planeGeometry args={[HALL_LENGTH + 4, HALL_DEPTH + 4]} />
        <meshStandardMaterial color={night ? "#07090f" : "#161a24"} roughness={1} />
      </mesh>
      <instancedMesh ref={trussRef} args={[undefined, undefined, trussRows]}>
        <boxGeometry args={[HALL_LENGTH, 1.6, 1.6]} />
        <meshStandardMaterial color="#5b6472" metalness={0.6} roughness={0.5} />
      </instancedMesh>
      <instancedMesh ref={trussRef2} args={[undefined, undefined, trussCols]}>
        <boxGeometry args={[1.6, 1.6, HALL_DEPTH]} />
        <meshStandardMaterial color="#5b6472" metalness={0.6} roughness={0.5} />
      </instancedMesh>
      <instancedMesh ref={lightRef} args={[undefined, undefined, trussRows * trussCols]}>
        <boxGeometry args={[6, 0.6, 2]} />
        <meshStandardMaterial color="#f8fafc" emissive={night ? "#ffd27a" : "#ffffff"} emissiveIntensity={night ? 0.9 : 2.2} toneMapped={false} />
      </instancedMesh>
    </group>
  );
}

/** Hall letters over the front concourse, aisle numbers over every aisle, Artists' Alley and Arcade marquees. */
function HangingSigns({ night }: { night: boolean }) {
  const hallSigns = useMemo(() => HALLS.map((h) => signTexture([`HALL ${h}`], { bg: "#111827", fg: "#ffffff", w: 512, h: 160, size: 110 })), []);
  const aisleSigns = useMemo(() => Array.from({ length: EXHIBIT_AISLES }, (_, a) => signTexture([String((a + 1) * 100)], { bg: "#1d4ed8", fg: "#ffffff", w: 256, h: 128, size: 92 })), []);
  const aaSign = useMemo(() => signTexture(["ARTISTS' ALLEY"], { bg: "#7c3aed", fg: "#ffffff", w: 1024, h: 200, size: 120 }), []);
  const arcadeSign = useMemo(() => signTexture(["ARCADE"], { bg: "#0a0a14", fg: "#ff2bd6", w: 1024, h: 256, size: 200 }), []);
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
