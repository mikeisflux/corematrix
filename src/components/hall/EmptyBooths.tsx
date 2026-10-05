"use client";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { signTexture } from "./textures";
import { useHall } from "@/lib/hall/store";
import { hallLayout, ARCADE, type BoothSpace } from "@/lib/hall/layout";
import { BOOTH_SIZES, formatMoney, type BoothSize } from "@/lib/config";

const tmp = new THREE.Object3D();
const SIZES = Object.keys(BOOTH_SIZES) as BoothSize[];

/** Every unclaimed space, instanced per size: taped outline on the floor, grey drape, an "available" card. */
export function EmptyBooths({ claimed, night }: { claimed: Map<number, unknown>; night: boolean }) {
  const groups = useMemo(() => {
    const all = hallLayout().filter((b) => !claimed.has(b.id));
    return SIZES.map((size) => ({ size, spaces: all.filter((b) => b.size === size) }));
  }, [claimed]);
  return <>{groups.map((g) => g.spaces.length > 0 && <SizeGroup key={g.size} size={g.size} spaces={g.spaces} night={night} />)}</>;
}

function SizeGroup({ size, spaces, night }: { size: BoothSize; spaces: BoothSpace[]; night: boolean }) {
  const tape = useRef<THREE.InstancedMesh>(null);
  const floor = useRef<THREE.InstancedMesh>(null);
  const drape = useRef<THREE.InstancedMesh>(null);
  const rails = useRef<THREE.InstancedMesh>(null);
  const posts = useRef<THREE.InstancedMesh>(null);
  const card = useRef<THREE.InstancedMesh>(null);
  const tables = useRef<THREE.InstancedMesh>(null);
  const tops = useRef<THREE.InstancedMesh>(null);
  const banners = useRef<THREE.InstancedMesh>(null);
  const hovered = useHall((s) => s.hovered);
  const selected = useHall((s) => s.selected);
  const select = useHall((s) => s.select);
  const setHovered = useHall((s) => s.setHovered);
  const def = BOOTH_SIZES[size];
  const island = size === "20x20";
  const table = size === "6x10";
  // every space of a size shares one footprint; w runs along x, d along z (feet)
  const w = spaces[0].w, d = spaces[0].d;
  const cardTex = useMemo(() => signTexture(["AVAILABLE", def.short, `from ${formatMoney(def.priceCents)}`], { bg: "#fff8dc", fg: "#111827", accentBar: "#ffd166", w: 256, h: 192, size: 34 }), [def]);
  // roll-up banner art: tall portrait
  const bannerTex = useMemo(() => signTexture(["YOUR", "BANNER", "HERE", "", def.short, `from ${formatMoney(def.priceCents)}`], { bg: "#111827", fg: "#ffd166", accentBar: "#ffd166", w: 256, h: 512, size: 40 }), [def]);
  // table length along the open edge; how many tables a space gets
  const L = island || d === 20 ? 8 : table ? 5.4 : 6;
  const per = island ? 4 : d === 20 ? 2 : 1;
  const bannerH = 6, bannerW = 3; // the default roll-up every space comes with
  const ids = useMemo(() => spaces.map((s) => s.id), [spaces]);

  useEffect(() => {
    if (!floor.current || !card.current || !tape.current) return;
    spaces.forEach((s, i) => {
      const f = s.facing;
      tmp.rotation.set(0, 0, 0); tmp.scale.set(1, 1, 1);
      tmp.position.set(s.x, 0.02, s.z); tmp.updateMatrix(); tape.current!.setMatrixAt(i, tmp.matrix);
      tmp.position.set(s.x, 0.05, s.z); tmp.updateMatrix(); floor.current!.setMatrixAt(i, tmp.matrix);
      if (drape.current) {
        // pipe-and-drape back wall on the back edge (the line shared with the booth behind)
        tmp.position.set(s.x - f * (w / 2 - 0.25), table ? 1.6 : 4, s.z); tmp.updateMatrix(); drape.current.setMatrixAt(i, tmp.matrix);
      }
      if (rails.current) {
        // 3 ft side rails along both edges, running from the back wall 70% of the way to the aisle
        for (const k of [0, 1]) { tmp.position.set(s.x - f * (w / 2 - w * 0.35), 1.5, s.z + (k ? 1 : -1) * (d / 2 - 0.15)); tmp.updateMatrix(); rails.current.setMatrixAt(i * 2 + k, tmp.matrix); }
      }
      if (posts.current) {
        // islands are open on all four sides: corner posts mark the 20×20
        [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([px, pz], k) => { tmp.position.set(s.x + px * (w / 2 - 0.2), 4, s.z + pz * (d / 2 - 0.2)); tmp.updateMatrix(); posts.current!.setMatrixAt(i * 4 + k, tmp.matrix); });
      }
      // card stands at the open side facing the aisle; islands face whichever concourse they border
      if (island) {
        const dir = Math.abs(s.z - ARCADE.z) < d * 2 ? Math.sign(ARCADE.z - s.z) : -1;
        tmp.position.set(s.x, 2.4, s.z + dir * (d / 2 - 0.6)); tmp.rotation.set(0, dir > 0 ? 0 : Math.PI, 0);
      } else {
        tmp.position.set(s.x + f * (w / 2 - 1.2), 2.4, s.z); tmp.rotation.set(0, f === 1 ? Math.PI / 2 : -Math.PI / 2, 0);
      }
      tmp.updateMatrix(); card.current!.setMatrixAt(i, tmp.matrix);
      // furniture: skirted table 1.6 ft in from each open edge, roll-up banner 4.6 ft in behind it
      const seats: { x: number; z: number; rot: number; nx: number; nz: number }[] = [];
      if (island) {
        seats.push({ x: s.x, z: s.z + d / 2, rot: 0, nx: 0, nz: 1 }, { x: s.x, z: s.z - d / 2, rot: Math.PI, nx: 0, nz: -1 }, { x: s.x + w / 2, z: s.z, rot: Math.PI / 2, nx: 1, nz: 0 }, { x: s.x - w / 2, z: s.z, rot: -Math.PI / 2, nx: -1, nz: 0 });
      } else {
        const rot = f === 1 ? Math.PI / 2 : -Math.PI / 2;
        if (d === 20) seats.push({ x: s.x + f * w / 2, z: s.z - 5, rot, nx: f, nz: 0 }, { x: s.x + f * w / 2, z: s.z + 5, rot, nx: f, nz: 0 });
        else seats.push({ x: s.x + f * w / 2, z: s.z, rot, nx: f, nz: 0 });
      }
      seats.forEach((q, k) => {
        const j = i * per + k;
        tmp.rotation.set(0, q.rot, 0);
        tmp.position.set(q.x - q.nx * 1.6, 1.3, q.z - q.nz * 1.6); tmp.updateMatrix(); tables.current?.setMatrixAt(j, tmp.matrix);
        tmp.position.set(q.x - q.nx * 1.6, 2.66, q.z - q.nz * 1.6); tmp.updateMatrix(); tops.current?.setMatrixAt(j, tmp.matrix);
        // banner stands a little to one side behind the table, like a real roll-up
        const side = (k % 2 ? -1 : 1) * (L / 2 - bannerW / 2 - 0.2);
        tmp.position.set(q.x - q.nx * 4.4 + (q.nx === 0 ? side : 0), bannerH / 2 + 0.3, q.z - q.nz * 4.4 + (q.nz === 0 ? side : 0)); tmp.updateMatrix(); banners.current?.setMatrixAt(j, tmp.matrix);
      });
    });
    for (const m of [tape, floor, drape, rails, posts, card, tables, tops, banners]) if (m.current) m.current.instanceMatrix.needsUpdate = true;
  }, [spaces, island, table, w, d, L, per, bannerH, bannerW]);

  useEffect(() => {
    if (!floor.current) return;
    const c = new THREE.Color();
    spaces.forEach((s, i) => { floor.current!.setColorAt(i, c.set(s.id === selected ? "#ffd166" : s.id === hovered ? "#fde68a" : night ? "#4b5563" : "#9ca3af")); });
    if (floor.current.instanceColor) floor.current.instanceColor.needsUpdate = true;
  }, [spaces, hovered, selected, night]);

  const over = (e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); const id = e.instanceId != null ? ids[e.instanceId] : null; if (id) { setHovered(id); document.body.style.cursor = "pointer"; } };
  const out = () => { setHovered(null); document.body.style.cursor = ""; };
  const click = (e: ThreeEvent<MouseEvent>) => { e.stopPropagation(); const id = e.instanceId != null ? ids[e.instanceId] : null; if (id) select(id); };
  const n = spaces.length;
  const floorGeo = useMemo(() => { const g = new THREE.PlaneGeometry(w - 0.6, d - 0.6); g.rotateX(-Math.PI / 2); return g; }, [w, d]);
  const tapeGeo = useMemo(() => { const g = new THREE.PlaneGeometry(w, d); g.rotateX(-Math.PI / 2); return g; }, [w, d]);
  const drapeColor = night ? "#1f2937" : "#374151";
  return (
    <group>
      {/* taped outline of the exact footprint */}
      <instancedMesh ref={tape} args={[tapeGeo, undefined, n]} onPointerOver={over} onPointerOut={out} onClick={click}>
        <meshStandardMaterial color={night ? "#b45309" : "#f59e0b"} roughness={1} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
      </instancedMesh>
      <instancedMesh ref={floor} args={[floorGeo, undefined, n]} onPointerOver={over} onPointerOut={out} onClick={click}>
        <meshStandardMaterial color="#9ca3af" roughness={1} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
      </instancedMesh>
      {!island && (
        <instancedMesh ref={drape} args={[undefined, undefined, n]} onPointerOver={over} onPointerOut={out} onClick={click}>
          <boxGeometry args={[0.5, table ? 3.2 : 8, d]} />
          <meshStandardMaterial color={drapeColor} roughness={0.95} />
        </instancedMesh>
      )}
      {!island && !table && (
        <instancedMesh ref={rails} args={[undefined, undefined, n * 2]} onPointerOver={over} onPointerOut={out} onClick={click}>
          <boxGeometry args={[w * 0.7, 3, 0.3]} />
          <meshStandardMaterial color={drapeColor} roughness={0.95} />
        </instancedMesh>
      )}
      {island && (
        <instancedMesh ref={posts} args={[undefined, undefined, n * 4]} onPointerOver={over} onPointerOut={out} onClick={click}>
          <boxGeometry args={[0.4, 8, 0.4]} />
          <meshStandardMaterial color={night ? "#6b7280" : "#9ca3af"} metalness={0.6} roughness={0.4} />
        </instancedMesh>
      )}
      <instancedMesh ref={card} args={[undefined, undefined, n]} onPointerOver={over} onPointerOut={out} onClick={click}>
        <boxGeometry args={[2.2, 1.7, 0.1]} />
        <meshStandardMaterial map={cardTex} emissive="#fff" emissiveMap={cardTex} emissiveIntensity={night ? 0.4 : 0.05} />
      </instancedMesh>
      {/* skirted tables along the open edge, white top */}
      <instancedMesh ref={tables} args={[undefined, undefined, n * per]} onPointerOver={over} onPointerOut={out} onClick={click}>
        <boxGeometry args={[2.5, 2.6, L]} />
        <meshStandardMaterial color={night ? "#374151" : "#4b5563"} roughness={0.95} />
      </instancedMesh>
      <instancedMesh ref={tops} args={[undefined, undefined, n * per]} onPointerOver={over} onPointerOut={out} onClick={click}>
        <boxGeometry args={[2.6, 0.12, L + 0.1]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.6} />
      </instancedMesh>
      {/* roll-up banner behind each table */}
      <instancedMesh ref={banners} args={[undefined, undefined, n * per]} onPointerOver={over} onPointerOut={out} onClick={click}>
        <boxGeometry args={[bannerW, bannerH, 0.08]} />
        <meshStandardMaterial map={bannerTex} emissive="#fff" emissiveMap={bannerTex} emissiveIntensity={night ? 0.35 : 0.08} />
      </instancedMesh>
    </group>
  );
}
