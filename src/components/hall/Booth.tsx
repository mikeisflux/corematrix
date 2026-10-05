"use client";
import { memo, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
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
  // uploaded artwork wins over the generated signage; the version number busts the texture cache on re-upload
  const wideUrl = booth.art?.wide ? `/api/art/${booth.id}/wide?v=${booth.art.wide}` : null;
  const portraitUrl = booth.art?.portrait ? `/api/art/${booth.id}/portrait?v=${booth.art.portrait}` : null;
  const drapeUrl = booth.art?.drape ? `/api/art/${booth.id}/drape?v=${booth.art.drape}` : null;
  const drapeArt = useMemo(() => (drapeUrl ? logoTexture(drapeUrl) : null), [drapeUrl]);
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
  const portrait = useMemo(() => portraitUrl ? logoTexture(portraitUrl) : signTexture([booth.name ?? "", booth.tagline ?? ""].filter(Boolean), { bg: booth.color, fg: luminance(booth.color) < 0.35 ? "#fff" : "#0b0f1a", w: 256, h: 640, size: 40 }), [portraitUrl, booth.name, booth.tagline, booth.color]);
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

  if (island) {
    const th = booth.house ? 28 : Math.max(14, sign.height);
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
        {/* a Table runs along z at rot 0, so the north/south edges (which run along x) get PI/2 */}
        {([[0, -7.5, Math.PI / 2], [0, 7.5, Math.PI / 2], [-7.5, 0, 0], [7.5, 0, 0]] as const).map(([x, z, r], i) => <Table key={i} x={x} z={z} rot={r} cloth={booth.cloth} art={drapeArt} books={books} first={i * 4} onBook={bannerClick} wide />)}
        {[[-9.5, -9.5], [9.5, -9.5], [-9.5, 9.5], [9.5, 9.5]].map(([x, z], i) => <mesh key={i} position={[x, 4, z]}><cylinderGeometry args={[0.15, 0.15, 8, 6]} /><meshStandardMaterial color="#374151" /></mesh>)}
        {/* roll-up banner behind each table, facing out (3×6 by default, up to 8×16 when upgraded) */}
        {([[0, -5.6, Math.PI], [0, 5.6, 0], [-5.6, 0, -Math.PI / 2], [5.6, 0, Math.PI / 2]] as const).map(([x, z, r], i) => (
          <Prop key={i} name="banner_stand" position={[x, 0, z]} rotation={[0, r, 0]} scale={[bw / 3, bh / 6, 1]} maps={{ banner: portrait }} onClick={bannerClick} fallback={<group position={[0, bh / 2 + 0.2, 0]} onClick={bannerClick}><TwoSided w={bw} h={bh}><meshStandardMaterial map={portrait} emissiveMap={portrait} emissive="#fff" emissiveIntensity={glow} /></TwoSided></group>} />
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
        {/* low drape behind the table */}
        <mesh position={[-w / 2 + 0.3, 1.6, 0]}><boxGeometry args={[0.3, 3.2, d]} /><meshStandardMaterial map={drape} roughness={0.95} /></mesh>
        <Table x={w / 2 - 2.2} z={0} rot={0} cloth={booth.cloth} art={drapeArt} books={books} first={0} onBook={bannerClick} />
        {/* print rack on the table */}
        {[-1.6, 0, 1.6].map((z) => <mesh key={z} position={[w / 2 - 2.2, 3.1, z]} rotation={[-0.35, 0, 0]}><boxGeometry args={[0.1, 1.3, 1.1]} /><meshStandardMaterial color={booth.accent} /></mesh>)}
        {/* retractable banner stand */}
        <Prop name="banner_stand" position={[-w / 2 + 1.1, 0, 0]} rotation={[0, Math.PI / 2, 0]} scale={[3 / 2.6, 6 / 6.4, 1]} maps={{ banner: portrait }} onClick={bannerClick} fallback={<group position={[0, 3.2, 0]} onClick={bannerClick}><TwoSided w={3} h={6}><meshStandardMaterial map={portrait} emissiveMap={portrait} emissive="#fff" emissiveIntensity={glow} /></TwoSided></group>} />
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
      {wide ? <><Table x={w / 2 - 1.8} z={-5} rot={0} cloth={booth.cloth} art={drapeArt} books={books} first={0} onBook={bannerClick} /><Table x={w / 2 - 1.8} z={5} rot={0} cloth={booth.cloth} art={drapeArt} books={books} first={3} onBook={bannerClick} /></> : <Table x={w / 2 - 1.8} z={0} rot={0} cloth={booth.cloth} art={drapeArt} books={books} first={0} onBook={bannerClick} />}
      {/* retractable banner centred behind each table: 3×6 ft by default, taller when the exhibitor paid for it (cap 16 ft) */}
      {(wide ? [-5, 5] : [0]).map((z) => (
        <Prop key={z} name="banner_stand" position={[-w / 2 + 1.1, 0, z]} rotation={[0, Math.PI / 2, 0]} scale={[bw / 3, bh / 6, 1]} maps={{ banner: portrait }} onClick={bannerClick} fallback={<group position={[0, bh / 2 + 0.2, 0]} rotation={[0, Math.PI / 2, 0]} onClick={bannerClick}><TwoSided w={bw} h={bh}><meshStandardMaterial map={portrait} emissiveMap={portrait} emissive="#fff" emissiveIntensity={glow} /></TwoSided></group>} />
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

/** A draped table; `art` is the owner's drape print for the aisle-facing skirt panel (material cloth_front); `books` are covers keyed by platform, this table owning platforms first..first+n-1. */
function Table({ x, z, rot, cloth, wide, art, books, first = 0, onBook }: { x: number; z: number; rot: number; cloth: string; wide?: boolean; art?: THREE.Texture | null; books?: Map<number, THREE.Texture>; first?: number; onBook?: (e: { stopPropagation: () => void }) => void }) {
  const len = wide ? 8 : 6;
  const n = Math.max(2, Math.round(len / 2));
  return (
    <group position={[x, 0, z]} rotation={[0, rot, 0]}>
      <Prop name={wide ? "table_wide" : "table"} colors={{ cloth, cloth_front: cloth }} maps={art ? { cloth_front: art } : undefined} fallback={<TableFallback len={len} cloth={cloth} art={art} />} />
      {books && Array.from({ length: n }, (_, i) => books.get(first + i)).map((tex, i) => tex && (
        // platform i sits at x 0.35, top at y 3.03; the book leans back a touch and faces the aisle (+x)
        <group key={i} position={[0.3, 3.03, -len / 2 + (i + 0.5) * (len / n)]} rotation={[0, 0, 0.14]} onClick={onBook}>
          <mesh position={[-0.05, 0.54, 0]}><boxGeometry args={[0.08, 1.08, 0.72]} /><meshStandardMaterial color="#f1f5f9" roughness={0.8} /></mesh>
          <mesh position={[0, 0.54, 0]} rotation={[0, Math.PI / 2, 0]}><planeGeometry args={[0.72, 1.08]} /><meshStandardMaterial map={tex} roughness={0.55} /></mesh>
        </group>
      ))}
    </group>
  );
}
function TableFallback({ len, cloth, art }: { len: number; cloth: string; art?: THREE.Texture | null }) {
  return (
    <group>
      <mesh position={[0, 1.3, 0]}><boxGeometry args={[2.6, 2.6, len]} /><meshStandardMaterial color={cloth} roughness={0.9} /></mesh>
      {art && <mesh position={[1.31, 1.15, 0]} rotation={[0, Math.PI / 2, 0]}><planeGeometry args={[len - 0.3, (len - 0.3) / 3]} /><meshStandardMaterial map={art} roughness={0.9} transparent alphaTest={0.02} /></mesh>}
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

/** The house booth's extras: LED floor ring, light columns on the corners, a spinning logo cube on the tower, scrolling marquee banners, always-on glow. */
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
      {corners.map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <mesh position={[0, 5, 0]}><boxGeometry args={[0.7, 10, 0.7]} /><meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.1} toneMapped={false} /></mesh>
          <pointLight position={[0, 9, 0]} intensity={35} distance={30} color={color} />
        </group>
      ))}
      <pointLight position={[0, th + 3, 0]} intensity={160} distance={70} color={color} />
    </group>
  );
}
