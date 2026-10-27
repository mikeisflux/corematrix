"use client";
import { TABLE_STANDS, DRAPE_PANEL_MAX_W } from "@/lib/hall/modelkit/props";
import { memo, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
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

/* Shared hardware: one geometry + material for every upright, base plate and crossbar in the hall. */
const ALU = new THREE.MeshStandardMaterial({ color: "#c3c9d2", metalness: 0.85, roughness: 0.3 });
const ALU_DARK = new THREE.MeshStandardMaterial({ color: "#4b5563", metalness: 0.7, roughness: 0.45 });
const FRAME = new THREE.MeshStandardMaterial({ color: "#161a24", roughness: 0.6, metalness: 0.1 });
const MAT_WHITE = new THREE.MeshStandardMaterial({ color: "#e9ecf1", roughness: 0.8 });
const BAR = new THREE.CylinderGeometry(0.045, 0.045, 1, 8); // unit length along y, rotated per use
const uprights = new Map<number, THREE.BufferGeometry>();
/** Pole + round base plate as one geometry per height (8 ft walls, 3 ft rails, 3.2 ft alley drape). */
function uprightGeo(h: number): THREE.BufferGeometry {
  let g = uprights.get(h);
  if (!g) {
    const pole = new THREE.CylinderGeometry(0.07, 0.07, h, 8); pole.translate(0, h / 2, 0);
    const plate = new THREE.CylinderGeometry(0.5, 0.56, 0.05, 12); plate.translate(0, 0.025, 0);
    g = mergeGeometries([pole, plate], false)!; pole.dispose(); plate.dispose(); uprights.set(h, g);
  }
  return g;
}
/** Three matted prints pinned to the artists' alley drape, as two meshes. */
const PRINT_MATS = mergeGeometries([-3.2, 0, 3.2].map((z) => { const g = new THREE.BoxGeometry(0.04, 1.8, 1.5); g.translate(0, 0, z); return g; }), false)!;
const PRINT_ART = mergeGeometries([-3.2, 0, 3.2].map((z) => { const g = new THREE.PlaneGeometry(1.2, 1.5); g.rotateY(Math.PI / 2); g.translate(0.03, 0, z); return g; }), false)!;

/** A pipe-and-drape upright on its round base plate. */
function Upright({ x, z, h }: { x: number; z: number; h: number }) {
  return <mesh geometry={uprightGeo(h)} material={ALU} position={[x, 0, z]} />;
}
/** A horizontal crossbar: along z (the frontage) or along x (the booth's depth). */
function Bar({ x, y, z, len, along }: { x: number; y: number; z: number; len: number; along: "x" | "z" }) {
  return <mesh geometry={BAR} material={ALU} position={[x, y, z]} rotation={along === "z" ? [Math.PI / 2, 0, 0] : [0, 0, Math.PI / 2]} scale={[1, len, 1]} />;
}
/**
 * Pipe and drape: a fabric back wall hung from a crossbar between two uprights,
 * and (unless `low`) 3 ft side rails running 70% of the way to the aisle. Local
 * +x is the aisle, the back wall sits at -w/2.
 */
function PipeAndDrape({ w, d, drape, low }: { w: number; d: number; drape: THREE.Texture; low?: boolean }) {
  const H = low ? 3.2 : 8, bx = -w / 2 + 0.25, side = w * 0.7;
  return (
    <group>
      <mesh position={[bx, H / 2 - 0.05, 0]}><boxGeometry args={[0.35, H - 0.2, d - 0.3]} /><meshStandardMaterial map={drape} roughness={0.95} /></mesh>
      <Upright x={bx} z={-d / 2 + 0.15} h={H} />
      <Upright x={bx} z={d / 2 - 0.15} h={H} />
      <Bar x={bx} y={H} z={0} len={d - 0.3} along="z" />
      {!low && [-1, 1].map((s) => (
        <group key={s}>
          <mesh position={[bx + side / 2, 1.45, s * (d / 2 - 0.15)]}><boxGeometry args={[side - 0.2, 2.8, 0.25]} /><meshStandardMaterial map={drape} roughness={0.95} /></mesh>
          <Upright x={bx + side} z={s * (d / 2 - 0.15)} h={3} />
          <Bar x={bx + side / 2} y={3} z={s * (d / 2 - 0.15)} len={side} along="x" />
        </group>
      ))}
    </group>
  );
}

export const Booth = memo(function Booth({ booth, night, hovered, selected, preview }: Props) {
  const space = useMemo(() => boothSpace(booth.id), [booth.id]);
  const select = useHall((s) => s.select);
  const setHovered = useHall((s) => s.setHovered);
  const sign = useMemo(() => signageForValue(booth.valueCents, booth.tier), [booth.valueCents, booth.tier]);
  // uploaded artwork wins over the generated signage; the version number busts the texture cache on re-upload
  const wideUrl = booth.art?.wide ? `/api/art/${booth.id}/wide?v=${booth.art.wide}` : null;
  const portraitUrl = booth.art?.portrait ? `/api/art/${booth.id}/portrait?v=${booth.art.portrait}` : null;
  const drapeUrl = booth.art?.drape ? `/api/art/${booth.id}/drape?v=${booth.art.drape}` : null;
  const drapeArt = useMemo(() => (drapeUrl ? logoTexture(drapeUrl) : null), [drapeUrl]);
  // island-only: a wrap for the tower's four faces and a print on the floor
  const towerUrl = booth.art?.tower ? `/api/art/${booth.id}/tower?v=${booth.art.tower}` : null;
  const towerArt = useMemo(() => (towerUrl ? logoTexture(towerUrl) : null), [towerUrl]);
  const floorUrl = booth.art?.floor ? `/api/art/${booth.id}/floor?v=${booth.art.floor}` : null;
  const floorArt = useMemo(() => (floorUrl ? logoTexture(floorUrl) : null), [floorUrl]);
  // standing comic covers: slot "book:N" → platform N, counted table by table
  const bookKey = Object.entries(booth.art ?? {}).filter(([k]) => k.startsWith("book:")).map(([k, v]) => `${k}=${v}`).sort().join("|");
  const books = useMemo(() => {
    const m = new Map<number, THREE.Texture>();
    for (const part of bookKey.split("|").filter(Boolean)) { const [k, v] = part.split("="); m.set(Number(k.slice(5)), logoTexture(`/api/art/${booth.id}/${k}?v=${v}`)); }
    return m;
  }, [bookKey, booth.id]);
  const banner = useMemo(() => {
    const t = wideUrl ? logoTexture(wideUrl) : bannerTexture({ name: booth.name ?? "", tagline: booth.tagline, color: booth.color, accent: booth.accent, style: booth.style, label: booth.label, wide: booth.size === "20x10" || booth.size === "20x20" });
    if (booth.house) { t.wrapS = THREE.RepeatWrapping; t.needsUpdate = true; }
    return t;
  }, [wideUrl, booth.name, booth.tagline, booth.color, booth.accent, booth.style, booth.label, booth.size, booth.house]);
  const portrait = useMemo(() => portraitUrl ? logoTexture(portraitUrl) : signTexture([booth.name ?? "", booth.tagline ?? ""].filter(Boolean), { bg: booth.color, fg: luminance(booth.color) < 0.35 ? "#fff" : "#0b0f1a", accentBar: booth.accent, w: 512, h: 1280, size: 84 }), [portraitUrl, booth.name, booth.tagline, booth.color, booth.accent]);
  const hang = useMemo(() => wideUrl ? logoTexture(wideUrl) : signTexture([booth.name ?? ""], { bg: "#0b0f1a", fg: booth.accent, accentBar: booth.color, w: 1024, h: 256, size: 150 }), [wideUrl, booth.name, booth.accent, booth.color]);
  const drape = useMemo(() => drapeTexture(booth.cloth), [booth.cloth]);
  const logo = useMemo(() => logoTexture(`/api/logo/${booth.id}?v=${booth.logoVersion ?? 0}`), [booth.id, booth.logoVersion]);
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
  const chairFallback = <><mesh position={[0, 1.5, 0]}><boxGeometry args={[1.4, 0.14, 1.4]} /><meshStandardMaterial color="#1f2937" /></mesh><mesh position={[0, 2.3, -0.65]}><boxGeometry args={[1.4, 1.2, 0.12]} /><meshStandardMaterial color="#1f2937" /></mesh></>;

  if (island) {
    const th = booth.house ? 28 : Math.max(14, sign.height);
    // the roll-ups (up to 16 ft) stand right in front of each face, so the band and logo live above them,
    // centred in the free part of the face: band 1.9 ft, gap, 4 ft logo board
    const freeLo = bh + 1, freeHi = th - 0.5, stack = 1.9 + 0.8 + 4;
    const stackLo = Math.max(freeLo, (freeLo + freeHi) / 2 - stack / 2);
    const faceBandY = stackLo + 0.95, faceLogoY = stackLo + 1.9 + 0.8 + 2;
    return (
      <group position={[space.x, 0, space.z]} {...common}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}><planeGeometry args={[w, d]} /><meshStandardMaterial map={floorArt ?? undefined} color={floorArt && !hovered && !selected ? "#ffffff" : floorColor} roughness={1} transparent opacity={preview ? 0.6 : floorArt ? 1 : 0.9} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} /></mesh>
        {/* fabric-wrapped tower on a plinth, aluminium corner trims, a cap, a banner and logo board on each face (or the owner's wrap on all four faces) */}
        <mesh position={[0, 0.25, 0]} material={FRAME}><boxGeometry args={[8.8, 0.5, 8.8]} /></mesh>
        <mesh position={[0, th / 2, 0]} castShadow onClick={bannerClick}><boxGeometry args={[8, th, 8]} /><meshStandardMaterial map={towerArt ?? drape} color="#ffffff" roughness={towerArt ? 0.6 : 0.9} emissiveMap={towerArt ?? undefined} emissive={towerArt ? "#ffffff" : "#000000"} emissiveIntensity={towerArt ? glow : 0} /></mesh>
        {[[-4, -4], [4, -4], [-4, 4], [4, 4]].map(([x, z], i) => <mesh key={i} position={[x, th / 2, z]} material={ALU_DARK}><boxGeometry args={[0.3, th, 0.3]} /></mesh>)}
        <mesh position={[0, th + 0.25, 0]} material={FRAME}><boxGeometry args={[8.6, 0.5, 8.6]} /></mesh>
        {/* banner band with the logo board above it, stacked in the part of the face that shows above the roll-ups */}
        {!towerArt && ([0, Math.PI / 2, Math.PI, -Math.PI / 2] as const).map((r, i) => (
          <group key={i} rotation={[0, r, 0]}>
            <mesh position={[0, faceBandY, 4.02]} material={FRAME}><boxGeometry args={[7.8, 7.6 / 4 + 0.2, 0.05]} /></mesh>
            <mesh position={[0, faceBandY, 4.06]} onClick={bannerClick}><planeGeometry args={[7.6, 7.6 / 4]} /><meshStandardMaterial map={banner} emissiveMap={banner} emissive="#ffffff" emissiveIntensity={glow} /></mesh>
            <mesh position={[0, faceLogoY, 4.02]} material={MAT_WHITE}><boxGeometry args={[4.3, 4.3, 0.05]} /></mesh>
            <mesh position={[0, faceLogoY, 4.06]}><planeGeometry args={[4, 4]} /><meshBasicMaterial map={logo} toneMapped={false} /></mesh>
          </group>
        ))}
        {/* hanging sign */}
        <group position={[0, Math.min(CEILING - 4, th + 7), 0]}>
          <group onClick={bannerClick}><TwoSided w={18} h={4.5}><meshStandardMaterial map={hang} emissiveMap={hang} emissive="#fff" emissiveIntensity={night ? 0.6 : 0.1} /></TwoSided></group>
          <group rotation={[0, Math.PI / 2, 0]} onClick={bannerClick}><TwoSided w={18} h={4.5}><meshStandardMaterial map={hang} emissiveMap={hang} emissive="#fff" emissiveIntensity={night ? 0.6 : 0.1} /></TwoSided></group>
          {[-7, 7].map((x) => <mesh key={x} geometry={BAR} material={ALU} position={[x, (CEILING - Math.min(CEILING - 4, th + 7)) / 2, 0]} scale={[1.2, CEILING - Math.min(CEILING - 4, th + 7), 1.2]} />)}
        </group>
        {/* tables on four sides + a header frame on corner uprights */}
        {/* a Table runs along z at rot 0, so the north/south edges (which run along x) get PI/2 */}
        {/* one table per edge, each turned so its aisle side (local +x: stands, drape print) faces out of the island: north -z, south +z, west -x, east +x */}
        {([[0, -7.5, Math.PI / 2], [0, 7.5, -Math.PI / 2], [-7.5, 0, Math.PI], [7.5, 0, 0]] as const).map(([x, z, r], i) => <Table key={i} x={x} z={z} rot={r} cloth={booth.cloth} art={drapeArt} books={books} first={i * 4} onBook={bannerClick} wide />)}
        {/* the house booth swaps these for its lit columns */}
        {!booth.house && [[-9.5, -9.5], [9.5, -9.5], [-9.5, 9.5], [9.5, 9.5]].map(([x, z], i) => <Upright key={i} x={x} z={z} h={8} />)}
        {!booth.house && [-9.5, 9.5].map((s) => <group key={s}><Bar x={s} y={8} z={0} len={19} along="z" /><Bar x={0} y={8} z={s} len={19} along="x" /></group>)}
        {/* a chair behind each table, tucked beside the roll-up */}
        {([[2.5, -4.9, Math.PI], [-2.5, 4.9, 0], [4.9, 2.5, Math.PI / 2], [-4.9, -2.5, -Math.PI / 2]] as const).map(([x, z, r], i) => <group key={i} position={[x, 0, z]} rotation={[0, r, 0]}><Prop name="chair" fallback={chairFallback} /></group>)}
        {/* roll-up banner behind each table, facing out (3×6 by default, up to 8×16 when upgraded) */}
        {([[0, -5.6, Math.PI], [0, 5.6, 0], [-5.6, 0, -Math.PI / 2], [5.6, 0, Math.PI / 2]] as const).map(([x, z, r], i) => (
          <group key={i} position={[x, 0, z]} rotation={[0, r, 0]}><RollUp bw={bw} bh={bh} portrait={portrait} glow={glow} onClick={bannerClick} /></group>
        ))}
        {night && !booth.house && <pointLight position={[0, th + 2, 0]} intensity={120} distance={50} color={booth.accent} />}
        {booth.house && <Flagship color={booth.color} logo={logo} banner={banner} th={th} />}
        {tip}
      </group>
    );
  }

  if (artist) {
    return (
      <group position={[space.x, 0, space.z]} rotation={[0, rotY, 0]} {...common}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}><planeGeometry args={[w, d]} /><meshStandardMaterial color={floorColor} roughness={1} transparent opacity={0.55} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} /></mesh>
        {/* low drape behind the table, with three matted prints pinned to it */}
        <PipeAndDrape w={w} d={d} drape={drape} low />
        <mesh geometry={PRINT_MATS} material={MAT_WHITE} position={[-w / 2 + 0.45, 2.3, 0]} />
        <mesh geometry={PRINT_ART} position={[-w / 2 + 0.45, 2.3, 0]}><meshStandardMaterial color={booth.accent} roughness={0.7} /></mesh>
        <Table x={w / 2 - 2.2} z={0} rot={0} cloth={booth.cloth} art={drapeArt} books={books} first={0} onBook={bannerClick} />
        {/* retractable banner stand */}
        <group position={[-w / 2 + 1.1, 0, 0]} rotation={[0, Math.PI / 2, 0]}><RollUp bw={3} bh={6} portrait={portrait} glow={glow} onClick={bannerClick} /></group>
        {/* chair, beside the roll-up so neither hides the other */}
        <group position={[-w / 2 + 1.8, 0, 2.4]} rotation={[0, Math.PI / 2, 0]}><Prop name="chair" fallback={chairFallback} /></group>
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
      {/* pipe and drape: back wall 8ft on uprights, side rails 3ft */}
      <PipeAndDrape w={w} d={d} drape={drape} />
      {/* vinyl banner across the back wall, on a slim board */}
      <mesh position={[-w / 2 + 0.52, 6.2, 0]} rotation={[0, Math.PI / 2, 0]} material={FRAME}><boxGeometry args={[d - 0.6, (d - 0.8) / 4 + 0.2, 0.04]} /></mesh>
      <mesh position={[-w / 2 + 0.55, 6.2, 0]} rotation={[0, Math.PI / 2, 0]} onClick={bannerClick}>
        <planeGeometry args={[d - 0.8, (d - 0.8) / 4]} />
        <meshStandardMaterial map={banner} emissiveMap={banner} emissive="#ffffff" emissiveIntensity={glow} />
      </mesh>
      {/* logo board */}
      <mesh position={[-w / 2 + 0.53, 2.9, -d / 2 + 2.2]} rotation={[0, Math.PI / 2, 0]} material={MAT_WHITE}><boxGeometry args={[3.3, 3.3, 0.04]} /></mesh>
      <mesh position={[-w / 2 + 0.56, 2.9, -d / 2 + 2.2]} rotation={[0, Math.PI / 2, 0]}><planeGeometry args={[3, 3]} /><meshBasicMaterial map={logo} toneMapped={false} /></mesh>
      {/* header banner on posts (level 2+) */}
      {sign.level >= 2 && (
        <group position={[-w / 2 + 0.6, 9.6, 0]}>
          <mesh rotation={[0, Math.PI / 2, 0]} onClick={bannerClick}><planeGeometry args={[d - 0.8, 2.6]} /><meshStandardMaterial map={banner} emissiveMap={banner} emissive="#fff" emissiveIntensity={glow} side={THREE.DoubleSide} /></mesh>
          {[-d / 2 + 0.5, d / 2 - 0.5].map((z) => <mesh key={z} geometry={BAR} material={ALU} position={[0, -1.5, z]} scale={[1.6, 3.2, 1.6]} />)}
        </group>
      )}
      {sign.level >= 3 && <HangingSign tex={hang} y={sign.height} w={wide ? 16 : 11} night={night} onClick={bannerClick} big={sign.level >= 4} />}
      {/* tables */}
      {wide ? <><Table x={w / 2 - 1.8} z={-5} rot={0} cloth={booth.cloth} art={drapeArt} books={books} first={0} onBook={bannerClick} /><Table x={w / 2 - 1.8} z={5} rot={0} cloth={booth.cloth} art={drapeArt} books={books} first={TABLE_STANDS} onBook={bannerClick} /></> : <Table x={w / 2 - 1.8} z={0} rot={0} cloth={booth.cloth} art={drapeArt} books={books} first={0} onBook={bannerClick} />}
      {/* a chair behind each table, facing the aisle */}
      {(wide ? [-5, 5] : [0]).map((z) => <group key={z} position={[w / 2 - 4.6, 0, z + 1.6]} rotation={[0, Math.PI / 2, 0]}><Prop name="chair" fallback={chairFallback} /></group>)}
      {/* retractable banner centred behind each table: 3×6 ft by default, taller when the exhibitor paid for it (cap 16 ft) */}
      {(wide ? [-5, 5] : [0]).map((z) => (
        <group key={z} position={[-w / 2 + 1.1, 0, z]} rotation={[0, Math.PI / 2, 0]}><RollUp bw={bw} bh={bh} portrait={portrait} glow={glow} onClick={bannerClick} /></group>
      ))}
      {night && sign.level >= 3 && <pointLight position={[0, 8, 0]} intensity={40} distance={24} color={booth.accent} />}
      {tip}
    </group>
  );
});

/** A sign readable from both sides: two planes back to back on a slim dark board with a top rail. */
export function TwoSided({ w, h, children }: { w: number; h: number; children: React.ReactNode }) {
  return (
    <group>
      <mesh position={[0, 0, 0.08]}><planeGeometry args={[w, h]} />{children}</mesh>
      <mesh position={[0, 0, -0.08]} rotation={[0, Math.PI, 0]}><planeGeometry args={[w, h]} />{children}</mesh>
      <mesh material={FRAME}><boxGeometry args={[w + 0.1, h + 0.1, 0.12]} /></mesh>
      <mesh position={[0, h / 2 + 0.08, 0]} material={ALU_DARK}><boxGeometry args={[w + 0.2, 0.1, 0.3]} /></mesh>
    </group>
  );
}

/**
 * The retractable banner behind a table, facing local +z: the GLB stand scaled
 * from its 3×6 ft native size to bw×bh, or two back-to-back planes when the
 * model is not available. Placement (position/rotation) is the caller's group.
 */
function RollUp({ bw, bh, portrait, glow, onClick }: { bw: number; bh: number; portrait: THREE.Texture; glow: number; onClick: (e: { stopPropagation: () => void }) => void }) {
  const maps = useMemo(() => ({ banner: portrait }), [portrait]);
  return (
    <group scale={[bw / 3, bh / 6, 1]}>
      <Prop name="banner_stand" maps={maps} onClick={onClick} fallback={<group position={[0, 3.2, 0]} onClick={onClick}><TwoSided w={3} h={6}><meshStandardMaterial map={portrait} emissiveMap={portrait} emissive="#fff" emissiveIntensity={glow} /></TwoSided></group>} />
    </group>
  );
}

/** A draped table; `art` is the owner's drape print for the aisle-facing skirt panel (material cloth_front); `books` are covers keyed by stand, this table owning stands first..first+3 (four stands per table). */
function Table({ x, z, rot, cloth, wide, art, books, first = 0, onBook }: { x: number; z: number; rot: number; cloth: string; wide?: boolean; art?: THREE.Texture | null; books?: Map<number, THREE.Texture>; first?: number; onBook?: (e: { stopPropagation: () => void }) => void }) {
  const len = wide ? 8 : 6;
  const n = TABLE_STANDS;
  return (
    <group position={[x, 0, z]} rotation={[0, rot, 0]}>
      <Prop name={wide ? "table_wide" : "table"} colors={{ cloth, cloth_front: cloth }} maps={art ? { cloth_front: art } : undefined} fallback={<TableFallback len={len} cloth={cloth} art={art} />} />
      {books && Array.from({ length: n }, (_, i) => books.get(first + i)).map((tex, i) => tex && (
        // stand i sits at x 0.35, top at y 3.03; the book leans back against the easel and faces the aisle (+x)
        <group key={i} position={[0.3, 3.03, -len / 2 + (i + 0.5) * (len / n)]} rotation={[0, 0, 0.14]} onClick={onBook}>
          <mesh position={[-0.05, 0.54, 0]}><boxGeometry args={[0.08, 1.08, 0.72]} /><meshStandardMaterial color="#f1f5f9" roughness={0.8} /></mesh>
          <mesh position={[0, 0.54, 0]} rotation={[0, Math.PI / 2, 0]}><planeGeometry args={[0.72, 1.08]} /><meshStandardMaterial map={tex} roughness={0.55} /></mesh>
        </group>
      ))}
    </group>
  );
}
/** Primitives standing in for table.glb: pleat-textured skirt, hem, white topper, four comic stands. Same footprint and stand heights as the model. */
function TableFallback({ len, cloth, art }: { len: number; cloth: string; art?: THREE.Texture | null }) {
  const pleat = useMemo(() => drapeTexture(cloth), [cloth]);
  const n = TABLE_STANDS;
  return (
    <group>
      <mesh position={[0, 1.15, 0]}><boxGeometry args={[2.5, 2.3, len - 0.1]} /><meshStandardMaterial map={pleat} roughness={0.95} /></mesh>
      {art && <mesh position={[1.31, 1.15, 0]} rotation={[0, Math.PI / 2, 0]}><planeGeometry args={[Math.min(len - 0.3, DRAPE_PANEL_MAX_W), Math.min(len - 0.3, DRAPE_PANEL_MAX_W) / 3]} /><meshStandardMaterial map={art} roughness={0.9} transparent alphaTest={0.02} /></mesh>}
      <mesh position={[0, 2.37, 0]}><boxGeometry args={[2.76, 0.3, len + 0.16]} /><meshStandardMaterial color={cloth} roughness={0.9} /></mesh>
      <mesh position={[0, 2.55, 0]} material={MAT_WHITE}><boxGeometry args={[2.7, 0.1, len + 0.1]} /></mesh>
      {Array.from({ length: n }, (_, i) => -len / 2 + (i + 0.5) * (len / n)).map((o) => (
        <group key={o}>
          <mesh position={[0.35, 2.815, o]}><boxGeometry args={[1.08, 0.42, 0.94]} /><meshStandardMaterial color="#e5e7eb" /></mesh>
          <group position={[0.2, 3.03, o]} rotation={[0, 0, 0.14]}><mesh position={[0, 0.56, 0]} material={ALU}><boxGeometry args={[0.03, 1.12, 0.8]} /></mesh></group>
        </group>
      ))}
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
      {[-w / 2 + 1, w / 2 - 1].map((z) => <mesh key={z} geometry={BAR} material={ALU} position={[0, h / 2 + (CEILING - top) / 2, z]} scale={[1, CEILING - top, 1]} />)}
    </group>
  );
}

/** The house booth's extras: LED floor ring, light columns on the corners, lit tower edges and cap, a spinning logo cube on the tower, scrolling marquee banners, always-on glow. */
function Flagship({ color, logo, banner, th }: { color: string; logo: THREE.Texture; banner: THREE.Texture; th: number }) {
  const ring = useRef<THREE.Mesh>(null);
  const cube = useRef<THREE.Mesh>(null);
  const t = useRef(0);
  useFrame((_, dt) => {
    t.current += dt;
    if (cube.current) { cube.current.rotation.y += dt * 0.7; cube.current.position.y = th + 5.5 + Math.sin(t.current * 1.6) * 0.5; }
    if (ring.current) (ring.current.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.4 + Math.sin(t.current * 3) * 0.7;
    banner.offset.x = (banner.offset.x + dt * 0.05) % 1;
  });
  const corners: Array<[number, number]> = [[-9.5, -9.5], [9.5, -9.5], [-9.5, 9.5], [9.5, 9.5]];
  return (
    <group>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.08, 0]}>
        <ringGeometry args={[9.1, 9.9, 72]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.5} toneMapped={false} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={-3} polygonOffsetUnits={-3} />
      </mesh>
      <mesh ref={cube} position={[0, th + 5.5, 0]}>
        <boxGeometry args={[5, 5, 5]} />
        <meshStandardMaterial map={logo} emissiveMap={logo} emissive="#ffffff" emissiveIntensity={0.7} />
      </mesh>
      {/* LED tape down the tower edges and around the cap */}
      {[[-4.2, -4.2], [4.2, -4.2], [-4.2, 4.2], [4.2, 4.2]].map(([x, z], i) => <mesh key={i} position={[x, th / 2, z]}><boxGeometry args={[0.12, th, 0.12]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.2} toneMapped={false} /></mesh>)}
      <mesh position={[0, th + 0.55, 0]}><boxGeometry args={[8.9, 0.12, 8.9]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.2} toneMapped={false} /></mesh>
      {corners.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 5, 0]}><boxGeometry args={[0.7, 10, 0.7]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.1} toneMapped={false} /></mesh>
          <mesh position={[0, 10.15, 0]} material={FRAME}><boxGeometry args={[0.9, 0.3, 0.9]} /></mesh>
          <pointLight position={[0, 9, 0]} intensity={35} distance={30} color={color} />
        </group>
      ))}
      <pointLight position={[0, th + 3, 0]} intensity={160} distance={70} color={color} />
    </group>
  );
}
