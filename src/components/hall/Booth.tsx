"use client";
import { memo, useMemo } from "react";
import * as THREE from "three";
import { Html } from "@react-three/drei";
import { bannerTexture, drapeTexture, logoTexture, signTexture, luminance } from "./textures";
import { useHall, track, type HallBooth } from "@/lib/hall/store";
import { boothSpace, signageForValue, CEILING, describeSpace } from "@/lib/hall/layout";
import { formatMoney, BANNER, bannerWidth } from "@/lib/config";
import { Prop } from "./models";

interface Props { booth: HallBooth; night: boolean; hovered: boolean; selected: boolean; preview?: boolean }

/** Opens the exhibitor's site in a new tab. Called from a click handler so popup blockers allow it. */
export function openSite(id: number, website: string | null | undefined, src: string) {
  if (!website) return false;
  track({ kind: "clicks", boothId: id, source: src });
  window.open(`/app/go/${id}?src=${src}`, "_blank", "noopener");
  return true;
}

export const Booth = memo(function Booth({ booth, night, hovered, selected, preview }: Props) {
  const space = useMemo(() => boothSpace(booth.id), [booth.id]);
  const select = useHall((s) => s.select);
  const setHovered = useHall((s) => s.setHovered);
  const sign = useMemo(() => signageForValue(booth.valueCents, booth.tier), [booth.valueCents, booth.tier]);
  const banner = useMemo(() => bannerTexture({ name: booth.name ?? "", tagline: booth.tagline, color: booth.color, accent: booth.accent, style: booth.style, label: booth.label, wide: booth.size === "20x10" || booth.size === "20x20" }), [booth.name, booth.tagline, booth.color, booth.accent, booth.style, booth.label, booth.size]);
  const portrait = useMemo(() => signTexture([booth.name ?? "", booth.tagline ?? ""].filter(Boolean), { bg: booth.color, fg: luminance(booth.color) < 0.35 ? "#fff" : "#0b0f1a", w: 256, h: 640, size: 40 }), [booth.name, booth.tagline, booth.color]);
  const hang = useMemo(() => signTexture([booth.name ?? ""], { bg: "#0b0f1a", fg: booth.accent, accentBar: booth.color, w: 1024, h: 256, size: 150 }), [booth.name, booth.accent, booth.color]);
  const drape = useMemo(() => drapeTexture(booth.cloth), [booth.cloth]);
  const logo = useMemo(() => logoTexture(booth.hasLogo || !preview ? `/api/logo/${booth.id}` : `/api/logo/${booth.id}`), [booth.id, booth.hasLogo, preview]);
  if (!space) return null;
  const facing = space.facing;
  const rotY = facing === -1 ? Math.PI : 0;
  const w = facing === 0 ? space.w : space.w; // depth from aisle (local x)
  const d = space.d; // frontage (local z)
  const island = space.size === "20x20";
  const artist = space.kind === "artist";
  const glow = night ? 0.35 : 0;
  const bh = Math.min(artist ? BANNER.artistMaxHeight : BANNER.maxHeight, Math.max(BANNER.defaultHeight, booth.bannerHeight || BANNER.defaultHeight)), bw = bannerWidth(bh);
  const bannerClick = (e: { stopPropagation: () => void }) => { e.stopPropagation(); if (!preview) { if (!openSite(booth.id, booth.website, "banner")) select(booth.id); else select(booth.id); } };
  const tip = (hovered || selected) && !preview && (
    <Html position={[0, (island ? sign.height : 9) + 3, 0]} center zIndexRange={[50, 0]} style={{ pointerEvents: "none" }}>
      <div className="rounded-xl border border-white/10 bg-slate-950/90 px-3 py-2 text-left text-white shadow-xl backdrop-blur-sm whitespace-nowrap">
        <div className="text-[11px] uppercase tracking-wider text-amber-300/90">{describeSpace(space)}</div>
        <div className="text-sm font-semibold">{booth.name}</div>
        <div className="text-xs text-slate-300">{formatMoney(booth.valueCents)} value · {booth.totalViews.toLocaleString()} visits{booth.website ? " · click the banner to visit" : ""}</div>
      </div>
    </Html>
  );
  const common = {
    onPointerOver: (e: { stopPropagation: () => void }) => { e.stopPropagation(); if (!preview) { setHovered(booth.id); document.body.style.cursor = "pointer"; } },
    onPointerOut: () => { if (!preview) { setHovered(null); document.body.style.cursor = ""; } },
    onClick: (e: { stopPropagation: () => void }) => { e.stopPropagation(); if (!preview) select(booth.id); },
  };
  const floorColor = selected ? "#ffd166" : hovered ? "#e5e7eb" : booth.color;

  if (island) {
    const th = Math.max(14, sign.height);
    return (
      <group position={[space.x, 0, space.z]} {...common}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}><planeGeometry args={[w, d]} /><meshStandardMaterial color={floorColor} roughness={1} transparent opacity={preview ? 0.6 : 0.9} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} /></mesh>
        {/* tower with a banner on each face */}
        <mesh position={[0, th / 2, 0]} castShadow><boxGeometry args={[8, th, 8]} /><meshStandardMaterial map={drape} color="#ffffff" roughness={0.9} /></mesh>
        {([0, Math.PI / 2, Math.PI, -Math.PI / 2] as const).map((r, i) => (
          <group key={i} rotation={[0, r, 0]}>
            <mesh position={[0, th * 0.62, 4.06]} onClick={bannerClick}><planeGeometry args={[7.6, 7.6 / 4]} /><meshStandardMaterial map={banner} emissiveMap={banner} emissive="#ffffff" emissiveIntensity={glow} /></mesh>
            <mesh position={[0, th * 0.3, 4.06]}><planeGeometry args={[4, 4]} /><meshBasicMaterial map={logo} toneMapped={false} /></mesh>
          </group>
        ))}
        {/* hanging sign */}
        <group position={[0, Math.min(CEILING - 4, th + 7), 0]}>
          <group onClick={bannerClick}><TwoSided w={18} h={4.5}><meshStandardMaterial map={hang} emissiveMap={hang} emissive="#fff" emissiveIntensity={night ? 0.6 : 0.1} /></TwoSided></group>
          <group rotation={[0, Math.PI / 2, 0]} onClick={bannerClick}><TwoSided w={18} h={4.5}><meshStandardMaterial map={hang} emissiveMap={hang} emissive="#fff" emissiveIntensity={night ? 0.6 : 0.1} /></TwoSided></group>
          {[-7, 7].map((x) => <mesh key={x} position={[x, (CEILING - Math.min(CEILING - 4, th + 7)) / 2, 0]}><cylinderGeometry args={[0.06, 0.06, CEILING - Math.min(CEILING - 4, th + 7), 4]} /><meshStandardMaterial color="#9ca3af" /></mesh>)}
        </group>
        {/* tables on four sides + corner drape posts */}
        {([[0, -7.5, 0], [0, 7.5, 0], [-7.5, 0, Math.PI / 2], [7.5, 0, Math.PI / 2]] as const).map(([x, z, r], i) => <Table key={i} x={x} z={z} rot={r} cloth={booth.cloth} wide />)}
        {[[-9.5, -9.5], [9.5, -9.5], [-9.5, 9.5], [9.5, 9.5]].map(([x, z], i) => <mesh key={i} position={[x, 4, z]}><cylinderGeometry args={[0.15, 0.15, 8, 6]} /><meshStandardMaterial color="#374151" /></mesh>)}
        {night && <pointLight position={[0, th + 2, 0]} intensity={120} distance={50} color={booth.accent} />}
        {tip}
      </group>
    );
  }

  if (artist) {
    return (
      <group position={[space.x, 0, space.z]} rotation={[0, rotY, 0]} {...common}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}><planeGeometry args={[w, d]} /><meshStandardMaterial color={floorColor} roughness={1} transparent opacity={0.55} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} /></mesh>
        {/* low drape behind the table */}
        <mesh position={[-w / 2 + 0.3, 1.6, 0]}><boxGeometry args={[0.3, 3.2, d]} /><meshStandardMaterial map={drape} roughness={0.95} /></mesh>
        <Table x={w / 2 - 2.2} z={0} rot={0} cloth={booth.cloth} />
        {/* print rack on the table */}
        {[-1.6, 0, 1.6].map((z) => <mesh key={z} position={[w / 2 - 2.2, 3.1, z]} rotation={[-0.35, 0, 0]}><boxGeometry args={[0.1, 1.3, 1.1]} /><meshStandardMaterial color={booth.accent} /></mesh>)}
        {/* retractable banner stand */}
        <Prop name="banner_stand" position={[w / 2 - 5.2, 0, 0]} rotation={[0, Math.PI / 2, 0]} scale={[3 / 2.6, 6 / 6.4, 1]} maps={{ banner: portrait }} onClick={bannerClick} fallback={<group position={[0, 3.2, 0]} onClick={bannerClick}><TwoSided w={3} h={6}><meshStandardMaterial map={portrait} emissiveMap={portrait} emissive="#fff" emissiveIntensity={glow} /></TwoSided></group>} />
        {/* chair */}
        <Prop name="chair" position={[w / 2 - 4.4, 0, 0]} rotation={[0, Math.PI / 2, 0]} fallback={<><mesh position={[0, 1.1, 0]}><boxGeometry args={[1.4, 0.2, 1.4]} /><meshStandardMaterial color="#1f2937" /></mesh><mesh position={[-0.6, 2, 0]}><boxGeometry args={[0.2, 1.8, 1.4]} /><meshStandardMaterial color="#1f2937" /></mesh></>} />
        {sign.level >= 2 && <HangingSign tex={hang} y={sign.height} w={9} night={night} onClick={bannerClick} />}
        {tip}
      </group>
    );
  }

  // inline / corner booth
  const wide = d >= 20;
  return (
    <group position={[space.x, 0, space.z]} rotation={[0, rotY, 0]} {...common}>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}><planeGeometry args={[w, d]} /><meshStandardMaterial color={floorColor} roughness={1} transparent opacity={preview ? 0.6 : 0.9} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} /></mesh>
      {/* pipe and drape: back wall 8ft, side rails 3ft */}
      <mesh position={[-w / 2 + 0.25, 4, 0]}><boxGeometry args={[0.5, 8, d]} /><meshStandardMaterial map={drape} roughness={0.95} /></mesh>
      {[-d / 2 + 0.15, d / 2 - 0.15].map((z) => <mesh key={z} position={[-w / 2 + w * 0.35, 1.5, z]}><boxGeometry args={[w * 0.7, 3, 0.3]} /><meshStandardMaterial map={drape} roughness={0.95} /></mesh>)}
      {/* banner across the back wall */}
      <mesh position={[-w / 2 + 0.55, 6.2, 0]} rotation={[0, Math.PI / 2, 0]} onClick={bannerClick}>
        <planeGeometry args={[d - 0.8, (d - 0.8) / 4]} />
        <meshStandardMaterial map={banner} emissiveMap={banner} emissive="#ffffff" emissiveIntensity={glow} />
      </mesh>
      {/* logo board */}
      <mesh position={[-w / 2 + 0.56, 2.9, -d / 2 + 2.2]} rotation={[0, Math.PI / 2, 0]}><planeGeometry args={[3, 3]} /><meshBasicMaterial map={logo} toneMapped={false} /></mesh>
      {/* header banner on posts (level 2+) */}
      {sign.level >= 2 && (
        <group position={[-w / 2 + 0.6, 9.6, 0]}>
          <mesh rotation={[0, Math.PI / 2, 0]} onClick={bannerClick}><planeGeometry args={[d - 0.8, 2.6]} /><meshStandardMaterial map={banner} emissiveMap={banner} emissive="#fff" emissiveIntensity={glow} side={THREE.DoubleSide} /></mesh>
          {[-d / 2 + 0.5, d / 2 - 0.5].map((z) => <mesh key={z} position={[0, -1.5, z]}><cylinderGeometry args={[0.1, 0.1, 3, 4]} /><meshStandardMaterial color="#9ca3af" /></mesh>)}
        </group>
      )}
      {sign.level >= 3 && <HangingSign tex={hang} y={sign.height} w={wide ? 16 : 11} night={night} onClick={bannerClick} big={sign.level >= 4} />}
      {/* tables */}
      {wide ? <><Table x={w / 2 - 1.8} z={-5} rot={0} cloth={booth.cloth} /><Table x={w / 2 - 1.8} z={5} rot={0} cloth={booth.cloth} /></> : <Table x={w / 2 - 1.8} z={0} rot={0} cloth={booth.cloth} />}
      {/* retractable banner centred behind each table: 3×6 ft by default, taller when the exhibitor paid for it (cap 16 ft) */}
      {(wide ? [-5, 5] : [0]).map((z) => (
        <Prop key={z} name="banner_stand" position={[w / 2 - 4.6, 0, z]} rotation={[0, Math.PI / 2, 0]} scale={[bw / 3, bh / 6, 1]} maps={{ banner: portrait }} onClick={bannerClick} fallback={<group position={[0, bh / 2 + 0.2, 0]} rotation={[0, Math.PI / 2, 0]} onClick={bannerClick}><TwoSided w={bw} h={bh}><meshStandardMaterial map={portrait} emissiveMap={portrait} emissive="#fff" emissiveIntensity={glow} /></TwoSided></group>} />
      ))}
      {night && sign.level >= 3 && <pointLight position={[0, 8, 0]} intensity={40} distance={24} color={booth.accent} />}
      {tip}
    </group>
  );
});

/** A sign readable from both sides: two planes back to back (box faces mirror the texture on one side). */
export function TwoSided({ w, h, children }: { w: number; h: number; children: React.ReactNode }) {
  return (
    <group>
      <mesh position={[0, 0, 0.08]}><planeGeometry args={[w, h]} />{children}</mesh>
      <mesh position={[0, 0, -0.08]} rotation={[0, Math.PI, 0]}><planeGeometry args={[w, h]} />{children}</mesh>
      <mesh><boxGeometry args={[w, h, 0.12]} /><meshStandardMaterial color="#111827" /></mesh>
    </group>
  );
}

function Table({ x, z, rot, cloth, wide }: { x: number; z: number; rot: number; cloth: string; wide?: boolean }) {
  const len = wide ? 8 : 6;
  return <Prop name={wide ? "table_wide" : "table"} position={[x, 0, z]} rotation={[0, rot, 0]} colors={{ cloth }} fallback={<TableFallback len={len} cloth={cloth} />} />;
}
function TableFallback({ len, cloth }: { len: number; cloth: string }) {
  return (
    <group>
      <mesh position={[0, 1.3, 0]}><boxGeometry args={[2.6, 2.6, len]} /><meshStandardMaterial color={cloth} roughness={0.9} /></mesh>
      <mesh position={[0, 2.65, 0]}><boxGeometry args={[2.7, 0.1, len + 0.1]} /><meshStandardMaterial color="#f8fafc" /></mesh>
      {/* a few products */}
      {[-1.6, 0, 1.6].map((o) => <mesh key={o} position={[0.3, 2.9, o]}><boxGeometry args={[1.2, 0.4, 1]} /><meshStandardMaterial color="#e5e7eb" /></mesh>)}
    </group>
  );
}

function HangingSign({ tex, y, w, night, onClick, big }: { tex: THREE.Texture; y: number; w: number; night: boolean; onClick: (e: { stopPropagation: () => void }) => void; big?: boolean }) {
  const h = w / 4;
  const top = Math.min(CEILING - 2, y + h);
  return (
    <group position={[0, top - h / 2, 0]}>
      <group rotation={[0, Math.PI / 2, 0]} onClick={onClick}><TwoSided w={w} h={h}><meshStandardMaterial map={tex} emissiveMap={tex} emissive="#fff" emissiveIntensity={night ? 0.7 : 0.15} /></TwoSided></group>
      {big && <group onClick={onClick}><TwoSided w={w} h={h}><meshStandardMaterial map={tex} emissiveMap={tex} emissive="#fff" emissiveIntensity={night ? 0.7 : 0.15} /></TwoSided></group>}
      {[-w / 2 + 1, w / 2 - 1].map((z) => <mesh key={z} position={[0, h / 2 + (CEILING - top) / 2, z]}><cylinderGeometry args={[0.05, 0.05, CEILING - top, 4]} /><meshStandardMaterial color="#9ca3af" /></mesh>)}
    </group>
  );
}
