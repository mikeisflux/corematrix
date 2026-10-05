"use client";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import { signTexture } from "./textures";
import { useHall } from "@/lib/hall/store";
import { hallLayout, type BoothSpace } from "@/lib/hall/layout";
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
  const floor = useRef<THREE.InstancedMesh>(null);
  const drape = useRef<THREE.InstancedMesh>(null);
  const card = useRef<THREE.InstancedMesh>(null);
  const hovered = useHall((s) => s.hovered);
  const selected = useHall((s) => s.selected);
  const select = useHall((s) => s.select);
  const setHovered = useHall((s) => s.setHovered);
  const def = BOOTH_SIZES[size];
  const island = size === "20x20";
  const cardTex = useMemo(() => signTexture(["AVAILABLE", def.short, `from ${formatMoney(def.priceCents)}`], { bg: "#fff8dc", fg: "#111827", accentBar: "#ffd166", w: 256, h: 192, size: 34 }), [def]);
  const ids = useMemo(() => spaces.map((s) => s.id), [spaces]);

  useEffect(() => {
    if (!floor.current || !card.current) return;
    spaces.forEach((s, i) => {
      const rot = s.facing === -1 ? Math.PI : 0;
      tmp.position.set(s.x, 0.03, s.z); tmp.rotation.set(0, rot, 0); tmp.scale.set(1, 1, 1); tmp.updateMatrix();
      floor.current!.setMatrixAt(i, tmp.matrix);
      if (drape.current) { tmp.position.set(s.x, 0, s.z); tmp.updateMatrix(); drape.current.setMatrixAt(i, tmp.matrix); }
      // card stands at the open side, facing the aisle
      const cx = island ? s.x : s.x + s.facing * (s.w / 2 - 1.2);
      tmp.position.set(cx, 2.4, island ? s.z + s.d / 2 - 1.2 : s.z); tmp.rotation.set(0, island ? 0 : s.facing === 1 ? Math.PI / 2 : -Math.PI / 2, 0); tmp.updateMatrix();
      card.current!.setMatrixAt(i, tmp.matrix);
    });
    floor.current.instanceMatrix.needsUpdate = true;
    if (drape.current) drape.current.instanceMatrix.needsUpdate = true;
    card.current.instanceMatrix.needsUpdate = true;
  }, [spaces, island]);

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
  const geo = useMemo(() => { const g = new THREE.PlaneGeometry(def.w === 6 ? 10 : island ? 20 : 10, def.w === 6 ? 6 : island ? 20 : def.w === 20 ? 20 : 10); g.rotateX(-Math.PI / 2); return g; }, [def.w, island]);
  return (
    <group>
      <instancedMesh ref={floor} args={[geo, undefined, n]} onPointerOver={over} onPointerOut={out} onClick={click}>
        <meshStandardMaterial color="#9ca3af" roughness={1} transparent opacity={0.55} />
      </instancedMesh>
      {!island && size !== "6x10" && (
        <instancedMesh ref={drape} args={[undefined, undefined, n]} onPointerOver={over} onPointerOut={out} onClick={click}>
          <boxGeometry args={[0.4, 8, def.w === 20 ? 20 : 10]} />
          <meshStandardMaterial color={night ? "#1f2937" : "#374151"} roughness={0.95} />
        </instancedMesh>
      )}
      <instancedMesh ref={card} args={[undefined, undefined, n]} onPointerOver={over} onPointerOut={out} onClick={click}>
        <boxGeometry args={[2.2, 1.7, 0.1]} />
        <meshStandardMaterial map={cardTex} emissive="#fff" emissiveMap={cardTex} emissiveIntensity={night ? 0.4 : 0.05} />
      </instancedMesh>
    </group>
  );
}
