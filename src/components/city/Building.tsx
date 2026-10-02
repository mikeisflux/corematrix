"use client";
import { memo, useMemo, useRef } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import { facadeTexture, logoTexture } from "./textures";
import { heightForValue, LOT_DEPTH, LOT_WIDTH, plotPosition } from "@/lib/city/layout";
import type { CityPlot } from "@/lib/city/store";
import { useCity } from "@/lib/city/store";

interface Props {
  plot: CityPlot;
  night: boolean;
  hovered: boolean;
  selected: boolean;
}

/** Box segments that make up a building shape, in lot-relative units. */
function segmentsFor(shape: string, h: number): Array<{ x: number; z: number; w: number; d: number; y: number; h: number }> {
  const W = LOT_WIDTH - 1.5, D = LOT_DEPTH - 1.5;
  switch (shape) {
    case "stepped":
      return [
        { x: 0, z: 0, w: W, d: D, y: 0, h: h * 0.45 },
        { x: 0, z: 0, w: W * 0.72, d: D * 0.72, y: h * 0.45, h: h * 0.3 },
        { x: 0, z: 0, w: W * 0.45, d: D * 0.45, y: h * 0.75, h: h * 0.25 },
      ];
    case "twin":
      return [
        { x: -W * 0.27, z: 0, w: W * 0.42, d: D * 0.8, y: 0, h },
        { x: W * 0.27, z: 0, w: W * 0.42, d: D * 0.8, y: 0, h: h * 0.9 },
        { x: 0, z: 0, w: W * 0.2, d: D * 0.5, y: 0, h: h * 0.35 },
      ];
    case "cantilever":
      return [
        { x: -W * 0.2, z: 0, w: W * 0.55, d: D * 0.9, y: 0, h },
        { x: W * 0.15, z: 0, w: W * 0.7, d: D * 0.7, y: h * 0.55, h: h * 0.3 },
      ];
    case "spire":
      return [
        { x: 0, z: 0, w: W * 0.8, d: D * 0.8, y: 0, h: h * 0.15 },
        { x: 0, z: 0, w: W * 0.5, d: D * 0.5, y: h * 0.15, h: h * 0.85 },
      ];
    default:
      return [{ x: 0, z: 0, w: W, d: D, y: 0, h }];
  }
}

export const Building = memo(function Building({ plot, night, hovered, selected }: Props) {
  const pos = useMemo(() => plotPosition(plot.id), [plot.id]);
  const h = useMemo(() => heightForValue(plot.valueCents, plot.tier), [plot.valueCents, plot.tier]);
  const segs = useMemo(() => segmentsFor(plot.shape, h), [plot.shape, h]);
  const tex = useMemo(() => facadeTexture(plot.color, plot.style, night), [plot.color, plot.style, night]);
  const group = useRef<THREE.Group>(null);
  const select = useCity((s) => s.select);
  const setHovered = useCity((s) => s.setHovered);
  const logoUrl = `/api/logo/${plot.id}`;
  const logo = useMemo(() => logoTexture(logoUrl), [logoUrl]);
  const floors = plot.floors || Math.max(1, Math.round(h / 0.42));
  const emissive = night ? 0.55 : 0;

  useFrame((_, dt) => {
    if (!group.current) return;
    const target = hovered || selected ? 1.0 : 1;
    group.current.scale.y += (target - group.current.scale.y) * Math.min(1, dt * 8);
  });

  // The logo board faces the avenue; a tall sign on the roof for landmarks.
  const boardH = Math.min(6, Math.max(3, h * 0.12));
  const roofY = h;
  return (
    <group
      ref={group}
      position={[pos.x, 0, pos.z]}
      rotation={[0, pos.rotationY, 0]}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(plot.id);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        setHovered(null);
        document.body.style.cursor = "";
      }}
      onClick={(e) => {
        e.stopPropagation();
        select(plot.id);
      }}
    >
      {/* plinth */}
      <mesh position={[0, 0.3, 0]} receiveShadow>
        <boxGeometry args={[LOT_WIDTH, 0.6, LOT_DEPTH]} />
        <meshStandardMaterial color={selected ? "#ffd166" : hovered ? "#e5e7eb" : "#cfd3d8"} />
      </mesh>
      {segs.map((s, i) => {
        const t = tex.clone();
        t.needsUpdate = true;
        t.repeat.set(Math.max(1, Math.round(s.w / 4)), Math.max(1, Math.round(s.h / 3)));
        return (
          <mesh key={i} position={[s.x, s.y + s.h / 2 + 0.6, s.z]} castShadow receiveShadow>
            <boxGeometry args={[s.w, s.h, s.d]} />
            <meshStandardMaterial map={t} emissiveMap={t} emissive={new THREE.Color("#ffffff")} emissiveIntensity={emissive} roughness={plot.style === "glass" ? 0.25 : 0.8} metalness={plot.style === "glass" ? 0.4 : 0} />
          </mesh>
        );
      })}
      {/* roof feature */}
      {plot.roof === "spire" && (
        <mesh position={[0, roofY + 0.6 + Math.max(3, h * 0.2) / 2, 0]} castShadow>
          <coneGeometry args={[1.2, Math.max(3, h * 0.2), 4]} />
          <meshStandardMaterial color={plot.accent} emissive={night ? plot.accent : "#000"} emissiveIntensity={night ? 0.6 : 0} />
        </mesh>
      )}
      {plot.roof === "antenna" && (
        <group position={[0, roofY + 0.6, 0]}>
          <mesh position={[0, Math.max(2, h * 0.15) / 2, 0]}>
            <cylinderGeometry args={[0.12, 0.2, Math.max(2, h * 0.15), 6]} />
            <meshStandardMaterial color="#9ca3af" />
          </mesh>
          <mesh position={[0, Math.max(2, h * 0.15), 0]}>
            <sphereGeometry args={[0.35, 8, 8]} />
            <meshStandardMaterial color="#ff3b3b" emissive="#ff3b3b" emissiveIntensity={night ? 2 : 0.8} />
          </mesh>
        </group>
      )}
      {plot.roof === "garden" && (
        <mesh position={[0, roofY + 0.6 + 0.3, 0]}>
          <boxGeometry args={[segs[segs.length - 1].w * 0.9, 0.6, segs[segs.length - 1].d * 0.9]} />
          <meshStandardMaterial color="#4caf50" />
        </mesh>
      )}
      {(plot.roof === "billboard" || plot.tier !== "free") && (
        <group position={[0, roofY + 0.6 + 2.2, 0]}>
          <mesh>
            <boxGeometry args={[Math.min(7, LOT_WIDTH - 2), 3.6, 0.3]} />
            <meshBasicMaterial map={logo} toneMapped={false} />
          </mesh>
          <mesh position={[0, -2, 0]}>
            <boxGeometry args={[0.3, 1, 0.3]} />
            <meshStandardMaterial color="#6b7280" />
          </mesh>
        </group>
      )}
      {/* street-facing logo board */}
      <group position={[0, 0.6 + boardH / 2 + 1.0, segs[0].d / 2 + 0.25]}>
        <mesh>
          <planeGeometry args={[boardH * 0.95, boardH * 0.95]} />
          <meshBasicMaterial map={logo} toneMapped={false} />
        </mesh>
        <mesh position={[0, 0, -0.12]}>
          <boxGeometry args={[boardH * 0.95 + 0.4, boardH * 0.95 + 0.4, 0.2]} />
          <meshStandardMaterial color="#f8fafc" />
        </mesh>
      </group>
      {/* rooftop mechanicals */}
      {h > 10 && plot.roof === "flat" && (
        <mesh position={[segs[segs.length - 1].w * 0.2, roofY + 0.6 + 0.5, segs[segs.length - 1].d * -0.15]} castShadow>
          <boxGeometry args={[segs[segs.length - 1].w * 0.3, 1, segs[segs.length - 1].d * 0.3]} />
          <meshStandardMaterial color="#9ca3af" />
        </mesh>
      )}
      {/* landmark glow */}
      {plot.tier === "landmark" && (
        <pointLight position={[0, roofY + 3, 0]} intensity={night ? 40 : 0} distance={30} color={plot.accent} />
      )}
      {(hovered || selected) && (
        <Html position={[0, roofY + 6.5, 0]} center zIndexRange={[50, 0]} style={{ pointerEvents: "none" }}>
          <div className="rounded-xl border border-white/10 bg-slate-950/90 px-3 py-2 text-left text-white shadow-xl backdrop-blur-sm whitespace-nowrap">
            <div className="text-[11px] uppercase tracking-wider text-amber-300/90">Plot #{plot.id} · {floors} floors</div>
            <div className="text-sm font-semibold">{plot.name}</div>
            <div className="text-xs text-slate-300">${(plot.valueCents / 100).toLocaleString()} value · {plot.totalViews.toLocaleString()} views</div>
          </div>
        </Html>
      )}
    </group>
  );
});
