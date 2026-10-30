"use client";
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { signTexture } from "./textures";
import { ARCADE } from "@/lib/hall/layout";
import { BENCHES, player } from "./Avatar";
import { BENCH_SEATS, requestSit } from "@/lib/hall/seats";
import { theater, bumpTheater, setTheaterSound } from "@/lib/hall/theater";
import { scheduleAt } from "@/lib/theater-schedule";

/** The theater screen: 4:3 for the public-domain classics, 32 ft wide, its bottom edge a foot over the stage. */
const SCREEN_W = 32, SCREEN_H = 24, SCREEN_Y = 2 + 1.2 + SCREEN_H / 2;
type Playlist = { title: string; serverTime: number; items: { id: string; title: string; url: string; duration: number }[] };
import { CABINET_ROWS } from "./Avatar";
import { useHall, api, dragged } from "@/lib/hall/store";
import { TwoSided } from "./Booth";
import { useModelUrl } from "./models";

/* ---------- palette + the games on the floor ---------- */
const NEON = ["#00f5ff", "#ff2bd6", "#ffd166", "#5ee6c3", "#8338ec", "#ff6b6b"];
/** The screens cycle through the three real arcade games plus an attract loop. Marquees match. */
const GAMES = [
  { id: "snake", title: "SERPENT AVE.", color: "#5ee6c3", accent: "#ffd166", coins: "2 coins" },
  { id: "breakout", title: "BLOCK PARTY", color: "#ff6b6b", accent: "#00f5ff", coins: "2 coins" },
  { id: "runner", title: "ROOFTOP RUN", color: "#ffd166", accent: "#ff2bd6", coins: "3 coins" },
  { id: "attract", title: "FCC ARCADE", color: "#ff2bd6", accent: "#00f5ff", coins: "insert coin" },
] as const;
const rng = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const UP = new THREE.Vector3(0, 1, 0);
const ONE = new THREE.Vector3(1, 1, 1);
/** Where the overlays sit on a cabinet: the GLB's screen is a slab whose glass face is flat at z=0.73 (y 3.58..5.22). */
const SCREEN_LOCAL = new THREE.Matrix4().makeTranslation(0, 4.4, 0.76);
const MARQUEE_LOCAL = new THREE.Matrix4().makeTranslation(0, 6.3, 0.62);

/* ---------- canvas art (all client-side, drawn once unless noted) ---------- */
const TILE = 256;
interface Screens { canvas: HTMLCanvasElement; g: CanvasRenderingContext2D; tex: THREE.CanvasTexture }
let screens: Screens | null = null;
/** Attract-mode clock shared by every screen (module state: the atlas is global, so its animation is too). */
const attract = { last: -1, frame: 0 };
/** One 2x2 atlas of animated game screens shared by every cabinet; each game gets a texture view on its quarter. */
function screenAtlas(): Screens {
  if (screens) return screens;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = TILE * 2;
  const g = canvas.getContext("2d")!;
  // one texture for all four games (the planes carry the atlas quadrant in their UVs), so a redraw is one upload, not four
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = false; tex.minFilter = THREE.LinearFilter;
  screens = { canvas, g, tex };
  drawScreens(screens, 0);
  return screens;
}
function drawScreens(s: Screens, f: number) {
  const { g } = s;
  [drawSnake, drawBreakout, drawRunner, drawAttract].forEach((fn, i) => {
    g.save();
    g.translate((i % 2) * TILE, i < 2 ? 0 : TILE);
    g.beginPath(); g.rect(0, 0, TILE, TILE); g.clip();
    fn(g, f);
    // CRT: scanlines and a darker rim
    g.fillStyle = "rgba(0,0,0,0.3)";
    for (let y = 0; y < TILE; y += 3) g.fillRect(0, y, TILE, 1);
    const v = g.createRadialGradient(128, 128, 100, 128, 128, 200);
    v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,0.6)");
    g.fillStyle = v; g.fillRect(0, 0, TILE, TILE);
    g.restore();
  });
  s.tex.needsUpdate = true;
}
const hud = (g: CanvasRenderingContext2D, left: string, right: string, color: string) => {
  g.font = "bold 14px ui-monospace, Menlo, monospace"; g.textBaseline = "top";
  g.fillStyle = color; g.textAlign = "left"; g.fillText(left, 10, 8);
  g.textAlign = "right"; g.fillText(right, TILE - 10, 8);
};
const SNAKE_PATH: [number, number][] = (() => {
  // a lap around the board: the snake chases its tail forever
  const p: [number, number][] = [];
  for (let x = 2; x <= 13; x++) p.push([x, 3]);
  for (let y = 4; y <= 13; y++) p.push([13, y]);
  for (let x = 12; x >= 2; x--) p.push([x, 13]);
  for (let y = 12; y >= 4; y--) p.push([2, y]);
  return p;
})();
function drawSnake(g: CanvasRenderingContext2D, f: number) {
  g.fillStyle = "#04140c"; g.fillRect(0, 0, TILE, TILE);
  g.strokeStyle = "rgba(94,230,195,0.12)"; g.lineWidth = 1;
  for (let i = 0; i <= 16; i++) { g.beginPath(); g.moveTo(i * 16, 32); g.lineTo(i * 16, TILE); g.stroke(); g.beginPath(); g.moveTo(0, 32 + i * 14); g.lineTo(TILE, 32 + i * 14); g.stroke(); }
  const n = SNAKE_PATH.length;
  for (let k = 0; k < 11; k++) {
    const [cx, cy] = SNAKE_PATH[(f + n - k) % n];
    g.fillStyle = k === 0 ? "#ffd166" : k % 2 ? "#5ee6c3" : "#3dbf9c";
    g.fillRect(cx * 16 + 1, cy * 14 + 33, 14, 12);
  }
  const food = SNAKE_PATH[(f + 18) % n];
  g.fillStyle = "#ff6b6b"; g.beginPath(); g.arc(food[0] * 16 + 8, food[1] * 14 + 39, 5, 0, Math.PI * 2); g.fill();
  hud(g, "SERPENT AVE.", `SCORE ${String((f * 10) % 990).padStart(4, "0")}`, "#5ee6c3");
}
function drawBreakout(g: CanvasRenderingContext2D, f: number) {
  g.fillStyle = "#0b0820"; g.fillRect(0, 0, TILE, TILE);
  const rows = ["#ff6b6b", "#ff9f43", "#ffd166", "#5ee6c3", "#00f5ff", "#8338ec"];
  const wave = Math.floor(f / 6);
  for (let r = 0; r < 6; r++) for (let c = 0; c < 8; c++) {
    if (((r * 8 + c) * 7919 + wave * 31) % 5 === 0) continue;
    g.fillStyle = rows[r]; g.fillRect(18 + c * 28, 36 + r * 12, 25, 9);
  }
  const bx = 128 + Math.sin(f * 0.8) * 96, by = 128 + Math.abs(Math.cos(f * 0.55)) * 96;
  g.fillStyle = "#ffffff"; g.beginPath(); g.arc(bx, by, 4, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#00f5ff"; g.fillRect(Math.max(14, Math.min(TILE - 58, bx - 22)), 236, 44, 6);
  hud(g, "BLOCK PARTY", `${String((f * 20) % 1600).padStart(4, "0")}`, "#ff6b6b");
}
function drawRunner(g: CanvasRenderingContext2D, f: number) {
  const sky = g.createLinearGradient(0, 0, 0, 160);
  sky.addColorStop(0, "#1a0b3d"); sky.addColorStop(1, "#6b1a6b");
  g.fillStyle = sky; g.fillRect(0, 0, TILE, 160);
  g.fillStyle = "#ff6b6b"; g.beginPath(); g.arc(186, 118, 30, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#6b1a6b"; for (let y = 104; y < 150; y += 10) g.fillRect(150, y, 72, 3);
  const scroll = (f * 9) % 48;
  g.fillStyle = "#120a26";
  for (let i = -1; i < 7; i++) { const h = 30 + ((i * 37) % 50 + 50) % 50; g.fillRect(i * 48 - scroll, 160 - h, 40, h); }
  g.fillStyle = "#0a0614"; g.fillRect(0, 160, TILE, TILE);
  g.fillStyle = "#2a2f4a";
  for (let i = -1; i < 4; i++) { const gap = (i + Math.floor(f / 5)) % 3 === 2; if (!gap) g.fillRect(i * 80 - scroll * 1.5, 186, 72, 70); }
  g.fillStyle = "#5ee6c3"; for (let i = -1; i < 4; i++) { const gap = (i + Math.floor(f / 5)) % 3 === 2; if (!gap) g.fillRect(i * 80 - scroll * 1.5, 186, 72, 3); }
  const jump = f % 5 === 0 ? 34 : f % 5 === 1 ? 20 : 0;
  const y = 186 - 26 - jump;
  g.fillStyle = "#ffd166"; g.fillRect(64, y + 8, 12, 18); g.fillRect(66, y, 9, 8);
  g.fillStyle = "#ff2bd6"; g.fillRect(62, y + 12, 16, 5);
  hud(g, "ROOFTOP RUN", `${(f * 7) % 2000}m`, "#ffd166");
}
function drawAttract(g: CanvasRenderingContext2D, f: number) {
  g.fillStyle = "#070612"; g.fillRect(0, 0, TILE, TILE);
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + f * 0.18;
    g.fillStyle = NEON[i % NEON.length];
    g.beginPath(); g.arc(128 + Math.cos(a) * 96, 128 + Math.sin(a) * 96, 5, 0, Math.PI * 2); g.fill();
  }
  g.textAlign = "center"; g.textBaseline = "middle";
  g.shadowColor = "#ff2bd6"; g.shadowBlur = 18;
  g.fillStyle = "#ff2bd6"; g.font = "900 46px Impact, 'Arial Black', sans-serif"; g.fillText("ARCADE", 128, 96);
  g.shadowBlur = 0;
  g.fillStyle = "#ffd166"; g.font = "bold 16px 'Inter', Arial, sans-serif"; g.fillText("100 COINS = $1 OF BOOTH VALUE", 128, 140);
  if (f % 2 === 0) { g.fillStyle = "#00f5ff"; g.font = "bold 22px ui-monospace, Menlo, monospace"; g.fillText("INSERT COIN", 128, 178); }
}

const marqueeCache = new Map<number, THREE.CanvasTexture>();
/** The backlit marquee above each screen: game title with a neon glow. */
function marqueeTexture(i: number): THREE.CanvasTexture {
  const hit = marqueeCache.get(i);
  if (hit) return hit;
  const game = GAMES[i];
  const c = document.createElement("canvas"); c.width = 512; c.height = 144;
  const g = c.getContext("2d")!;
  const bg = g.createLinearGradient(0, 0, 0, 144);
  bg.addColorStop(0, "#0d0b1f"); bg.addColorStop(1, "#1a1038");
  g.fillStyle = bg; g.fillRect(0, 0, 512, 144);
  g.strokeStyle = game.accent; g.lineWidth = 5; g.strokeRect(10, 10, 492, 124);
  g.textAlign = "center"; g.textBaseline = "middle";
  g.shadowColor = game.color; g.shadowBlur = 26;
  g.fillStyle = game.color; g.font = "900 58px Impact, 'Arial Black', sans-serif"; g.fillText(game.title, 256, 62);
  g.shadowBlur = 0;
  g.fillStyle = "#ffffff"; g.font = "bold 22px 'Inter', Arial, sans-serif"; g.fillText(game.coins.toUpperCase(), 256, 112);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  marqueeCache.set(i, t);
  return t;
}

let carpetTex: THREE.CanvasTexture | null = null;
/** Black-light arcade carpet: nebulae, stars and neon squiggles on near-black. Tiles seamlessly. */
function cosmicCarpet(): THREE.CanvasTexture {
  if (carpetTex) return carpetTex;
  const S = 512, M = 28;
  const c = document.createElement("canvas"); c.width = c.height = S;
  const g = c.getContext("2d")!;
  g.fillStyle = "#0a0718"; g.fillRect(0, 0, S, S);
  const r = rng(7);
  const blobs = ["#3b1d7a", "#7a1d5e", "#123c6b", "#1c6b5e"];
  for (let i = 0; i < 14; i++) {
    const x = r() * S, y = r() * S, rad = 70 + r() * 110;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, blobs[i % blobs.length]); gr.addColorStop(1, "rgba(10,7,24,0)");
    g.globalAlpha = 0.5; g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  g.globalAlpha = 1;
  for (let i = 0; i < 460; i++) { const s = r() < 0.9 ? 1 : 2; g.fillStyle = `rgba(255,255,255,${(0.25 + r() * 0.75).toFixed(2)})`; g.fillRect(r() * S, r() * S, s, s); }
  g.lineCap = "round";
  for (let i = 0; i < 20; i++) {
    const x = M + r() * (S - 2 * M), y = M + r() * (S - 2 * M), len = 4 + r() * 8;
    g.strokeStyle = NEON[i % NEON.length]; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(x - len, y); g.lineTo(x + len, y); g.moveTo(x, y - len); g.lineTo(x, y + len); g.stroke();
  }
  g.lineWidth = 3; g.globalAlpha = 0.85;
  for (let i = 0; i < 30; i++) {
    const col = NEON[Math.floor(r() * NEON.length)];
    g.strokeStyle = col;
    const x = M + r() * (S - 2 * M - 40), y = M + r() * (S - 2 * M);
    g.beginPath();
    if (i % 3 === 0) { g.moveTo(x, y); for (let k = 1; k <= 4; k++) g.quadraticCurveTo(x + k * 9 - 4, y + (k % 2 ? -11 : 11), x + k * 9, y); }
    else if (i % 3 === 1) { const s = 7 + r() * 8; g.moveTo(x, y - s); g.lineTo(x + s, y + s); g.lineTo(x - s, y + s); g.closePath(); }
    else g.arc(x, y, 5 + r() * 8, 0, Math.PI * 2);
    g.stroke();
  }
  for (let i = 0; i < 3; i++) {
    const x = 90 + r() * (S - 180), y = 90 + r() * (S - 180), rad = 9 + r() * 7;
    g.fillStyle = NEON[(i * 2 + 1) % NEON.length]; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "#ffd166"; g.lineWidth = 2.5; g.beginPath(); g.ellipse(x, y, rad * 1.9, rad * 0.55, -0.4, 0, Math.PI * 2); g.stroke();
  }
  g.globalAlpha = 1;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  t.repeat.set(ARCADE.w / 19, ARCADE.d / 19);
  carpetTex = t;
  return t;
}

let beamTex: THREE.CanvasTexture | null = null;
/** Alpha gradient for the light column over the pad: solid at the base, gone at the top. */
function beamTexture(): THREE.CanvasTexture {
  if (beamTex) return beamTex;
  const c = document.createElement("canvas"); c.width = 4; c.height = 128;
  const g = c.getContext("2d")!;
  const gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, "rgba(255,209,102,0)"); gr.addColorStop(0.55, "rgba(255,209,102,0.35)"); gr.addColorStop(1, "rgba(255,209,102,0.8)");
  g.fillStyle = gr; g.fillRect(0, 0, 4, 128);
  beamTex = new THREE.CanvasTexture(c);
  beamTex.colorSpace = THREE.SRGBColorSpace;
  return beamTex;
}

let padTex: THREE.CanvasTexture | null = null;
/** Helipad markings for the drone pad. */
function padTexture(): THREE.CanvasTexture {
  if (padTex) return padTex;
  const S = 512;
  const c = document.createElement("canvas"); c.width = c.height = S;
  const g = c.getContext("2d")!;
  g.fillStyle = "#0f1424"; g.fillRect(0, 0, S, S);
  g.strokeStyle = "#ffd166"; g.lineWidth = 14; g.beginPath(); g.arc(256, 256, 236, 0, Math.PI * 2); g.stroke();
  g.lineWidth = 4; g.strokeStyle = "#00f5ff"; g.beginPath(); g.arc(256, 256, 196, 0, Math.PI * 2); g.stroke();
  g.setLineDash([18, 14]); g.strokeStyle = "rgba(255,209,102,0.6)"; g.beginPath(); g.arc(256, 256, 150, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
  g.fillStyle = "#ffd166"; g.textAlign = "center"; g.textBaseline = "middle";
  g.font = "900 190px 'Inter', Arial, sans-serif"; g.fillText("H", 256, 246);
  g.font = "bold 34px 'Inter', Arial, sans-serif"; g.fillStyle = "#00f5ff"; g.fillText("FLYOVER", 256, 372);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  padTex = t;
  return t;
}

type Cab = { x: number; z: number; rot: number; game: number };
function layoutCabinets(): Cab[] {
  const out: Cab[] = [];
  for (const row of CABINET_ROWS) {
    const vertical = row.d > row.w;
    const n = Math.floor((vertical ? row.d : row.w) / 3.2);
    for (let i = 0; i < n; i++) {
      const t = -((n - 1) * 3.2) / 2 + i * 3.2;
      const k = vertical ? { x: row.x, z: row.z + t, rot: row.x < ARCADE.x ? Math.PI / 2 : -Math.PI / 2 } : { x: row.x + t, z: row.z, rot: row.z < ARCADE.z ? 0 : Math.PI };
      out.push({ ...k, game: out.length % GAMES.length });
    }
  }
  return out;
}

/** An instanced mesh whose instances are a fixed list of matrices. */
function Instanced({ geo, mat, items, castShadow }: { geo: THREE.BufferGeometry; mat: THREE.Material; items: THREE.Matrix4[]; castShadow?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  // layout effect: the matrices are in place before the first frame, so a bank never flashes at the origin when it swaps in
  useLayoutEffect(() => {
    const m = ref.current; if (!m) return;
    items.forEach((mx, i) => m.setMatrixAt(i, mx));
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
  }, [items]);
  return <instancedMesh ref={ref} args={[geo, mat, items.length]} castShadow={castShadow} frustumCulled={false} />;
}

/** The GLB cabinet, instanced per material: 5 draw calls for the whole bank instead of one scene clone per cabinet. */
function CabinetsGlb({ url, matrices, night }: { url: string; matrices: THREE.Matrix4[]; night: boolean }) {
  const { scene } = useGLTF(url);
  const parts = useMemo(() => {
    scene.updateMatrixWorld(true);
    const byMat = new Map<string, { mat: THREE.MeshStandardMaterial; geos: THREE.BufferGeometry[] }>();
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mat = m.material as THREE.MeshStandardMaterial;
      const g = m.geometry.clone(); g.applyMatrix4(m.matrixWorld);
      const e = byMat.get(mat.name) ?? { mat, geos: [] };
      e.geos.push(g); byMat.set(mat.name, e);
    });
    const out: { name: string; geo: THREE.BufferGeometry; mat: THREE.MeshStandardMaterial }[] = [];
    for (const [name, { mat, geos }] of byMat) {
      const m = mat.clone();
      const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
      if (merged) out.push({ name, geo: merged, mat: m }); else geos.forEach((geo, i) => out.push({ name: `${name}${i}`, geo, mat: m }));
    }
    return out;
  }, [scene]);
  useEffect(() => {
    for (const p of parts) {
      if (p.name.startsWith("screen")) p.mat.emissiveIntensity = night ? 0.9 : 0.5; // the joystick ball; the screen itself is covered by the overlay
      if (p.name.startsWith("marquee")) p.mat.emissiveIntensity = night ? 1.4 : 0.6; // the buttons
      if (p.name.startsWith("cabinet") || p.name.startsWith("side")) {
        p.mat.roughness = 0.45; p.mat.metalness = 0.25;
        // a whisper of deep blue at night so the bank reads as shapes against the dark floor, not a void
        p.mat.emissive.set("#101a4a"); p.mat.emissiveIntensity = night ? 0.5 : 0;
      }
    }
  }, [parts, night]);
  return <>{parts.map((p) => <Instanced key={p.name} geo={p.geo} mat={p.mat} items={matrices} castShadow />)}</>;
}

/** Boxy stand-in when the GLB is unavailable; the overlays still make it read as an arcade. */
function CabinetsFallback({ matrices }: { matrices: THREE.Matrix4[] }) {
  const parts = useMemo(() => {
    const body = new THREE.MeshStandardMaterial({ color: "#14122a", roughness: 0.5, metalness: 0.25 });
    const lower = new THREE.BoxGeometry(2.6, 3.2, 2.4).translate(0, 1.6, -0.1);
    const upper = new THREE.BoxGeometry(2.6, 3.6, 2.2).translate(0, 5, -0.4);
    const marquee = new THREE.BoxGeometry(2.7, 0.9, 1.6).translate(0, 6.3, -0.35);
    return { body, geo: mergeGeometries([lower, upper, marquee], false) ?? lower };
  }, []);
  return <Instanced geo={parts.geo} mat={parts.body} items={matrices} castShadow />;
}

/** Animated screens and backlit marquees, one instanced plane per game so 54 cabinets share four textures. */
function CabinetFaces({ cabinets, cabMats, night }: { cabinets: Cab[]; cabMats: THREE.Matrix4[]; night: boolean }) {
  const atlas = useMemo(() => screenAtlas(), []);
  const groups = useMemo(() => GAMES.map((_, gi) => {
    const idx = cabinets.map((c, i) => (c.game === gi ? i : -1)).filter((i) => i >= 0);
    return {
      screens: idx.map((i) => cabMats[i].clone().multiply(SCREEN_LOCAL)),
      marquees: idx.map((i) => cabMats[i].clone().multiply(MARQUEE_LOCAL)),
    };
  }), [cabinets, cabMats]);
  // each game's plane samples its own quadrant of the shared atlas
  const screenGeos = useMemo(() => GAMES.map((_, i) => {
    const g = new THREE.PlaneGeometry(2.1, 1.66);
    const uv = g.attributes.uv as THREE.BufferAttribute;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * 0.5 + (i % 2) * 0.5, uv.getY(k) * 0.5 + (i < 2 ? 0.5 : 0));
    return g;
  }), []);
  const marqueeGeo = useMemo(() => new THREE.PlaneGeometry(2.4, 0.68), []);
  const screenMat = useMemo(() => new THREE.MeshBasicMaterial({ map: atlas.tex, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), [atlas]);
  const marqueeMats = useMemo(() => GAMES.map((_, i) => new THREE.MeshBasicMaterial({ map: marqueeTexture(i), toneMapped: false })), []);
  useEffect(() => {
    // brighter than white at night so the bloom catches the glass
    screenMat.color.setScalar(night ? 1.3 : 1.05);
    marqueeMats.forEach((m) => m.color.setScalar(night ? 1.45 : 1.1));
  }, [night, screenMat, marqueeMats]);
  useFrame(({ clock, camera }) => {
    // attract mode at 4 fps: one atlas redraw feeds every screen in the hall
    const t = clock.elapsedTime;
    if (t - attract.last < 0.25) return;
    // nobody can see the cabinets from across the hall: skip the canvas redraw and upload
    if (Math.hypot(camera.position.x - ARCADE.x, camera.position.z - ARCADE.z) > 220) return;
    attract.last = t; attract.frame++;
    drawScreens(atlas, attract.frame);
  });
  return (
    <>
      {groups.map((gr, i) => (
        <group key={i}>
          <Instanced geo={screenGeos[i]} mat={screenMat} items={gr.screens} />
          <Instanced geo={marqueeGeo} mat={marqueeMats[i]} items={gr.marquees} />
        </group>
      ))}
    </>
  );
}

/* ---------- the plaza ---------- */
function NeonTube({ position, rotation, length, color, radius = 0.22, intensity }: { position: [number, number, number]; rotation?: [number, number, number]; length: number; color: string; radius?: number; intensity: number }) {
  return (
    <mesh position={position} rotation={rotation}>
      <cylinderGeometry args={[radius, radius, length, 10]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={intensity} roughness={0.3} toneMapped={false} />
    </mesh>
  );
}

/** A parked drone hovering over the pad: rotors spin, body bobs. */
function Drone({ night }: { night: boolean }) {
  const group = useRef<THREE.Group>(null);
  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime, g = group.current; if (!g) return;
    g.position.y = 3.4 + Math.sin(t * 1.6) * 0.25; g.rotation.z = Math.sin(t * 0.9) * 0.05; g.rotation.x = Math.cos(t * 1.1) * 0.04;
    for (const o of g.children) for (const r of o.children) if (r.name === "rotor") r.rotation.y += dt * 28;
  });
  const arms: [number, number][] = [[1, 1], [-1, 1], [1, -1], [-1, -1]];
  return (
    <group ref={group} position={[ARCADE.x, 3.4, ARCADE.z]}>
      <mesh castShadow><boxGeometry args={[1.5, 0.45, 1.5]} /><meshStandardMaterial color="#c3cad9" metalness={0.6} roughness={0.35} /></mesh>
      <mesh position={[0, -0.3, 0]}><boxGeometry args={[0.8, 0.2, 0.8]} /><meshStandardMaterial color="#1f2433" /></mesh>
      {[0.6, -0.6].map((z) => <mesh key={z} position={[0, 0.08, z * 0.76]}><boxGeometry args={[0.9, 0.18, 0.1]} /><meshStandardMaterial color={z > 0 ? "#ff2bd6" : "#00f5ff"} emissive={z > 0 ? "#ff2bd6" : "#00f5ff"} emissiveIntensity={night ? 3 : 1.8} toneMapped={false} /></mesh>)}
      {arms.map(([sx, sz], i) => (
        <group key={i} position={[sx * 1.15, 0.1, sz * 1.15]}>
          <mesh rotation={[0, Math.atan2(sz, sx) + Math.PI / 2, 0]} position={[-sx * 0.55, 0, -sz * 0.55]}><boxGeometry args={[0.16, 0.12, 1.5]} /><meshStandardMaterial color="#8a93a8" metalness={0.5} roughness={0.4} /></mesh>
          <mesh position={[0, 0.1, 0]}><cylinderGeometry args={[0.14, 0.16, 0.2, 10]} /><meshStandardMaterial color="#1f2433" /></mesh>
          <group name="rotor" position={[0, 0.22, 0]} rotation={[0, i * 0.7, 0]}>
            <mesh><boxGeometry args={[1.5, 0.03, 0.14]} /><meshStandardMaterial color="#cfd6e6" transparent opacity={0.7} /></mesh>
            <mesh rotation={[0, Math.PI / 2, 0]}><boxGeometry args={[1.5, 0.03, 0.14]} /><meshStandardMaterial color="#cfd6e6" transparent opacity={0.7} /></mesh>
          </group>
        </group>
      ))}
    </group>
  );
}

/** The flyover pad: helipad markings, a neon ring, an expanding pulse, a soft light column and the drone. */
function FlyoverPad({ night }: { night: boolean }) {
  const pad = useMemo(() => padTexture(), []);
  const beam = useMemo(() => beamTexture(), []);
  const pulse = useRef<THREE.Mesh>(null);
  const ride = useMemo(() => signTexture(["HALL FLYOVER", "drone ride · 5 coins"], { bg: "#0b0f1a", fg: "#ffd166", accentBar: "#00f5ff", w: 512, h: 200, size: 52 }), []);
  useFrame(({ clock }) => {
    const m = pulse.current; if (!m) return;
    const p = (clock.elapsedTime % 2.6) / 2.6;
    m.scale.setScalar(0.6 + p * 6.2);
    (m.material as THREE.MeshBasicMaterial).opacity = (1 - p) * (night ? 0.9 : 0.55);
  });
  return (
    <group position={[ARCADE.x, 0, ARCADE.z]}>
      <mesh position={[0, 0.4, 0]} castShadow><cylinderGeometry args={[6, 6.3, 0.8, 40]} /><meshStandardMaterial color="#161a2a" metalness={0.5} roughness={0.45} /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.81, 0]}><circleGeometry args={[5.95, 48]} /><meshStandardMaterial map={pad} emissiveMap={pad} emissive="#ffffff" emissiveIntensity={night ? 0.9 : 0.35} roughness={0.6} /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.86, 0]}><torusGeometry args={[6.15, 0.13, 10, 64]} /><meshStandardMaterial color="#00f5ff" emissive="#00f5ff" emissiveIntensity={night ? 3 : 1.6} toneMapped={false} /></mesh>
      <mesh ref={pulse} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.9, 0]}><ringGeometry args={[0.9, 1, 48]} /><meshBasicMaterial color="#00f5ff" transparent opacity={0.6} depthWrite={false} toneMapped={false} side={THREE.DoubleSide} /></mesh>
      <mesh position={[0, 7.4, 0]} renderOrder={10}><cylinderGeometry args={[3.6, 5.9, 13, 32, 1, true]} /><meshBasicMaterial color="#ffd166" map={beam} transparent={true} opacity={night ? 0.12 : 0.05} depthWrite={false} side={THREE.DoubleSide} toneMapped={false} /></mesh>
      <Drone night={night} />
      <group position={[0, 4.6, -7.2]}><TwoSided w={10} h={3.9}><meshBasicMaterial map={ride} toneMapped={false} /></TwoSided></group>
      {[-5.6, 5.6].map((x) => <mesh key={x} position={[x, 1.3, -7.2]}><boxGeometry args={[0.18, 2.6, 0.18]} /><meshStandardMaterial color="#9ca3af" metalness={0.6} roughness={0.4} /></mesh>)}
    </group>
  );
}

/** Stage with the leaderboard wall: bezel, neon frame, lit front edge. */
/**
 * The theater at the back of the plaza: the stage carries a 34×10.6 ft screen that plays the admin's playlist
 * (Admin → Settings → Theater) as a video texture, muted until someone nearby turns on sound; the clock picks the
 * file and the position so everyone watches the same moment. With nothing configured it shows a poster.
 */
function Theater({ night }: { night: boolean }) {
  const [show, setShow] = useState<Playlist | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => api<Playlist>("/api/theater").then((d) => { if (alive) setShow((prev) => (prev && JSON.stringify(prev.items) === JSON.stringify(d.items) && prev.title === d.title ? prev : d)); }).catch(() => {});
    load();
    const t = setInterval(load, 120000);
    return () => { alive = false; clearInterval(t); };
  }, []);
  const poster = useMemo(() => signTexture([show?.title || "NOW SHOWING", show?.items.length ? "" : "feature presentation · coming soon"].filter(Boolean), { bg: "#05060c", fg: "#ff2bd6", accentBar: "#00f5ff", w: 1024, h: 768, size: 110 }), [show]);
  const video = useMemo(() => {
    if (typeof document === "undefined") return null;
    const v = document.createElement("video");
    v.crossOrigin = "anonymous"; v.playsInline = true; v.muted = true; v.preload = "auto"; v.setAttribute("playsinline", "");
    return v;
  }, []);
  const tex = useMemo(() => { if (!video) return null; const t = new THREE.VideoTexture(video); t.colorSpace = THREE.SRGBColorSpace; return t; }, [video]);
  const [playing, setPlaying] = useState(false);
  const [aspect, setAspect] = useState(4 / 3);
  const tuneRef = useRef<() => void>(() => {});
  const farRef = useRef(false);
  const audio = useRef({ muted: true, volume: 1 }); // the picture's own shape; anything else is letterboxed on the 4:3 screen
  useEffect(() => {
    if (!video || !show?.items.length) { setPlaying(false); theater.playing = false; bumpTheater(); return; }
    const items = show.items;
    const dead = new Set<number>();
    // lagging: this film has stalled for buffering at least once. From then on it plays where it is instead of jumping
    // to the shared schedule: on a slow connection each jump threw the buffer away and refetched, so the screen moved
    // one frame every 15-20 s. It syncs up again with the next film.
    let alive = true, current = -1, offset = -1, stalled = false, lagging = false;
    const clock = () => Date.now() / 1000; // server and client clocks agree well enough for a film
    // the clock says which film and how far in; load it and jump there once its length is known
    // The clock says which film and how far in. Small drift is corrected by nudging the playback rate (invisible);
    // only a big gap (a stall, a tab that slept) seeks. Nothing happens while nobody is near enough to see the screen.
    const tune = () => {
      if (farRef.current) { if (!video.paused) video.pause(); return; }
      const s = scheduleAt(items, clock());
      let i = s.index, tries = 0;
      while (dead.has(i) && tries++ < items.length) i = (i + 1) % items.length;
      if (dead.has(i)) { setPlaying(false); theater.playing = false; bumpTheater(); return; }
      if (i !== current) { current = i; offset = s.offset; lagging = false; video.playbackRate = 1; video.src = items[i].url; video.load(); return; }
      const d = video.duration;
      if (s.offset >= 0 && Number.isFinite(d) && d > 0) {
        const drift = video.currentTime - s.offset; // + means we are ahead
        if (video.ended || (!lagging && !stalled && Math.abs(drift) > 20)) { video.currentTime = s.offset % d; video.playbackRate = 1; }
        else video.playbackRate = stalled || lagging ? 1 : Math.abs(drift) < 0.4 ? 1 : drift > 0 ? 0.94 : 1.06;
      }
      if (video.paused && !stalled) void video.play().catch(() => {});
    };
    tuneRef.current = tune;
    // Buffer before showing: the film starts (and resumes after a stall) only once a few seconds are loaded ahead,
    // so it plays smoothly instead of in fits; lost time is made up by the gentle rate nudge in tune().
    const AHEAD = 6;
    const ahead = () => { const b = video.buffered, t = video.currentTime; for (let k = 0; k < b.length; k++) if (b.start(k) <= t + 0.1 && b.end(k) >= t) return b.end(k) - t; return 0; };
    let waitTimer: ReturnType<typeof setInterval> | null = null;
    const playWhenBuffered = () => {
      if (waitTimer) return;
      stalled = true;
      if (video.currentTime > 0.5) lagging = true; // a stall mid-film, not the first load
      waitTimer = setInterval(() => {
        if (!alive) { clearInterval(waitTimer!); waitTimer = null; return; }
        const d = video.duration;
        const enough = ahead() >= AHEAD || video.readyState >= 4 || (Number.isFinite(d) && d - video.currentTime < AHEAD + 1);
        if (!enough || farRef.current) return;
        clearInterval(waitTimer!); waitTimer = null; stalled = false;
        void video.play().catch(() => {});
      }, 250);
    };
    const onMeta = () => {
      const d = video.duration;
      if (video.videoWidth && video.videoHeight) setAspect(video.videoWidth / video.videoHeight);
      if (offset >= 0 && Number.isFinite(d) && d > 0) video.currentTime = offset % d;
      playWhenBuffered();
    };
    const onWaiting = () => { if (!video.seeking || ahead() < 1) { video.pause(); playWhenBuffered(); } };
    const onPlaying = () => { if (alive) { setPlaying(true); theater.playing = true; theater.title = show.title; bumpTheater(); } };
    const onEnded = () => tune(); // the schedule says what is next; the same film again is a seek, not a reload
    const onErr = () => { if (!alive) return; dead.add(current); current = -1; tune(); };
    video.addEventListener("loadedmetadata", onMeta); video.addEventListener("playing", onPlaying); video.addEventListener("ended", onEnded); video.addEventListener("error", onErr); video.addEventListener("waiting", onWaiting);
    tune();
    const sync = setInterval(tune, 4000);
    return () => {
      alive = false; clearInterval(sync);
      video.removeEventListener("loadedmetadata", onMeta); video.removeEventListener("playing", onPlaying); video.removeEventListener("ended", onEnded); video.removeEventListener("error", onErr); video.removeEventListener("waiting", onWaiting);
      if (waitTimer) clearInterval(waitTimer);
      video.pause(); video.removeAttribute("src"); video.load();
      theater.playing = false; bumpTheater();
    };
  }, [video, show]);
  const z = ARCADE.z + ARCADE.d / 2 - 8;
  // Sound plays only while the walker is inside the arcade and has asked for it (the pill, or a click on the screen);
  // stepping out of the plaza switches it off. Far from the screen the film pauses and its frames stop uploading,
  // so the theater costs nothing to people elsewhere in the hall.
  useFrame(({ camera }) => {
    if (!video) return;
    const st = useHall.getState();
    const inArcade = st.mode === "walk" && Math.abs(player.x - ARCADE.x) < ARCADE.w / 2 && Math.abs(player.z - ARCADE.z) < ARCADE.d / 2;
    if (inArcade !== theater.near) { theater.near = inArcade; if (!inArcade && theater.sound) theater.sound = false; bumpTheater(); }
    const camDist = Math.hypot(camera.position.x - ARCADE.x, camera.position.z - (z + 4.5));
    // 190 ft takes in the whole plaza: the arcade is 86 ft deep and the walk camera rides 20 ft behind the player, so a
    // tighter limit (100 ft was tried) paused the film on a frozen frame for anyone in the front half of the arcade
    const far = camDist > 190;
    if (far !== farRef.current) { farRef.current = far; if (far) video.pause(); else tuneRef.current(); }
    if (far && tex) tex.needsUpdate = false;
    const muted = !(theater.sound && inArcade);
    if (muted !== audio.current.muted) { audio.current.muted = muted; video.muted = muted; }
    const d = Math.hypot(player.x - ARCADE.x, player.z - (z + 4.5));
    const volume = THREE.MathUtils.clamp(1 - (d - 16) / 40, 0.2, 1);
    if (!muted && Math.abs(volume - audio.current.volume) > 0.03) { audio.current.volume = volume; video.volume = volume; }
  });
  const neon = night ? 2.8 : 1.4;
  return (
    <group position={[ARCADE.x, 0, 0]}>
      <mesh position={[0, 1, z]} castShadow><boxGeometry args={[36, 2, 10]} /><meshStandardMaterial color="#0f1322" roughness={0.6} metalness={0.2} /></mesh>
      <mesh position={[0, 2.08, z - 5 + 0.08]}><boxGeometry args={[36, 0.14, 0.14]} /><meshStandardMaterial color="#00f5ff" emissive="#00f5ff" emissiveIntensity={neon} toneMapped={false} /></mesh>
      <mesh position={[0, 0.3, z - 5 + 0.08]}><boxGeometry args={[36, 0.1, 0.1]} /><meshStandardMaterial color="#ff2bd6" emissive="#ff2bd6" emissiveIntensity={neon} toneMapped={false} /></mesh>
      <group position={[0, SCREEN_Y, z + 4.5]}>
        {/* the audience is on the -z side: backing behind the picture, neon bezel just in front of it */}
        <mesh position={[0, 0, 0.45]}><boxGeometry args={[SCREEN_W + 2.4, SCREEN_H + 2.4, 0.5]} /><meshStandardMaterial color="#0b0f1a" metalness={0.4} roughness={0.5} /></mesh>
        {/* the picture at its own aspect, fitted inside the 4:3 screen; the backing shows as black bars around anything wider or taller */}
        <mesh rotation={[0, Math.PI, 0]} onClick={(e) => { if (dragged(e)) return; e.stopPropagation(); if (!theater.playing) return; if (!theater.near) { useHall.getState().setToast("Step into the arcade to hear the film."); return; } setTheaterSound(!theater.sound); useHall.getState().setToast(theater.sound ? "Sound on. It switches off when you leave the arcade." : "Sound off."); }}
          onPointerOver={() => { document.body.style.cursor = "pointer"; }} onPointerOut={() => { document.body.style.cursor = ""; }}>
          <planeGeometry args={playing ? [Math.min(SCREEN_W, SCREEN_H * aspect), Math.min(SCREEN_H, SCREEN_W / aspect)] : [SCREEN_W, SCREEN_H]} /><meshBasicMaterial map={playing && tex ? tex : poster} toneMapped={false} />
        </mesh>
        {[[0, SCREEN_H / 2 + 1.25, SCREEN_W + 2.4, 0.16], [0, -SCREEN_H / 2 - 1.25, SCREEN_W + 2.4, 0.16], [-SCREEN_W / 2 - 1.3, 0, 0.16, SCREEN_H + 2.4], [SCREEN_W / 2 + 1.3, 0, 0.16, SCREEN_H + 2.4]].map(([x, y, w, h], i) => (
          <mesh key={i} position={[x, y, -0.2]}><boxGeometry args={[w, h, 0.16]} /><meshStandardMaterial color={i < 2 ? "#ff2bd6" : "#00f5ff"} emissive={i < 2 ? "#ff2bd6" : "#00f5ff"} emissiveIntensity={neon} toneMapped={false} /></mesh>
        ))}
        {[-12, 12].map((x) => <mesh key={x} position={[x, -SCREEN_H / 2 - 1.2 - (SCREEN_Y - SCREEN_H / 2 - 1.2 - 2) / 2, -0.3]}><boxGeometry args={[0.5, SCREEN_Y - SCREEN_H / 2 - 1.2 - 2, 0.5]} /><meshStandardMaterial color="#2b3140" metalness={0.6} roughness={0.4} /></mesh>)}
        {/* the screen lights the seats when a film is on */}
        {/* always mounted, dimmed to 0: adding or removing a light recompiles every material in the hall */}
        <pointLight position={[0, -SCREEN_H / 2, -10]} intensity={playing ? (night ? 260 : 90) : 0} distance={60} decay={2} color="#9fb8ff" />
      </group>
      {/* benches: two rows, an aisle down the middle, facing the screen */}
      {BENCHES.map((b, i) => (
        <group key={i} position={[b.x - ARCADE.x, 0, b.z]} onClick={(e) => { if (dragged(e)) return; e.stopPropagation(); const px = e.point.x; let best = BENCH_SEATS[0], bd = Infinity; for (const sp of BENCH_SEATS) { const d = Math.hypot(sp.x - px, sp.z - b.z); if (d < bd) { bd = d; best = sp; } } requestSit(best); }} onPointerOver={() => { document.body.style.cursor = "pointer"; }} onPointerOut={() => { document.body.style.cursor = ""; }}>
          <mesh position={[0, 1.35, 0]} castShadow><boxGeometry args={[b.w, 0.45, b.d]} /><meshStandardMaterial color="#141a33" roughness={0.6} metalness={0.2} /></mesh>
          <mesh position={[0, 2.3, -b.d / 2 + 0.1]}><boxGeometry args={[b.w, 1.5, 0.18]} /><meshStandardMaterial color="#141a33" roughness={0.6} metalness={0.2} /></mesh>
          <mesh position={[0, 1.12, b.d / 2 - 0.05]}><boxGeometry args={[b.w, 0.06, 0.06]} /><meshStandardMaterial color="#00f5ff" emissive="#00f5ff" emissiveIntensity={neon * 0.6} toneMapped={false} /></mesh>
          {[-b.w / 2 + 0.6, 0, b.w / 2 - 0.6].map((x) => <mesh key={x} position={[x, 0.56, 0]}><boxGeometry args={[0.18, 1.12, b.d - 0.3]} /><meshStandardMaterial color="#2b3140" metalness={0.6} roughness={0.4} /></mesh>)}
        </group>
      ))}
    </group>
  );
}

/** The arcade plaza in the middle of the hall: cabinet banks with live screens, neon rails, cosmic carpet, the drone pad and the score wall. */
export function Arcade({ night }: { night: boolean }) {
  const carpet = useMemo(() => cosmicCarpet(), []);
  const setPanel = useHall((s) => s.setPanel);
  const cabinets = useMemo(() => layoutCabinets(), []);
  const cabMats = useMemo(() => cabinets.map((k) => new THREE.Matrix4().compose(new THREE.Vector3(k.x, 0, k.z), new THREE.Quaternion().setFromAxisAngle(UP, k.rot), ONE)), [cabinets]);
  const cabinetGlb = useModelUrl("cabinet");
  const pillar = night ? 3.2 : 1.6;
  const rail = night ? 2.6 : 1.3;
  const { x, z, w, d } = ARCADE;
  return (
    <group onClick={(e) => { if (dragged(e)) return; e.stopPropagation(); setPanel("arcade"); }} onPointerOver={() => { document.body.style.cursor = "pointer"; }} onPointerOut={() => { document.body.style.cursor = ""; }}>
      {/* carpet: lit by the hall by day, glowing under black light by night */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.05, z]} receiveShadow>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial map={carpet} emissiveMap={carpet} emissive="#ffffff" emissiveIntensity={night ? 0.55 : 0.14} roughness={0.95} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
      </mesh>
      {/* edge trim so the plaza reads as a room within the hall */}
      {[[x, z - d / 2, w + 0.6, 0.6], [x, z + d / 2, w + 0.6, 0.6], [x - w / 2, z, 0.6, d + 0.6], [x + w / 2, z, 0.6, d + 0.6]].map(([px, pz, pw, pd], i) => (
        <mesh key={i} position={[px, 0.09, pz]}><boxGeometry args={[pw, 0.08, pd]} /><meshStandardMaterial color="#8338ec" emissive="#8338ec" emissiveIntensity={night ? 1.6 : 0.6} toneMapped={false} /></mesh>
      ))}
      {cabinetGlb ? (
        <Suspense fallback={<CabinetsFallback matrices={cabMats} />}><CabinetsGlb url={cabinetGlb} matrices={cabMats} night={night} /></Suspense>
      ) : <CabinetsFallback matrices={cabMats} />}
      <CabinetFaces cabinets={cabinets} cabMats={cabMats} night={night} />
      {/* neon: magenta pillars at the corners, cyan rails along the top */}
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
        <group key={i} position={[x + (sx * w) / 2, 0, z + (sz * d) / 2]}>
          <mesh position={[0, 0.5, 0]}><cylinderGeometry args={[0.9, 1.1, 1, 12]} /><meshStandardMaterial color="#1f2433" metalness={0.6} roughness={0.4} /></mesh>
          <NeonTube position={[0, 8, 0]} length={15} radius={0.3} color="#ff2bd6" intensity={pillar} />
        </group>
      ))}
      <NeonTube position={[x, 15.3, z - d / 2]} rotation={[0, 0, Math.PI / 2]} length={w + 0.6} color="#00f5ff" intensity={rail} />
      <NeonTube position={[x, 15.3, z + d / 2]} rotation={[0, 0, Math.PI / 2]} length={w + 0.6} color="#00f5ff" intensity={rail} />
      <NeonTube position={[x - w / 2, 15.3, z]} rotation={[Math.PI / 2, 0, 0]} length={d + 0.6} color="#00f5ff" intensity={rail} />
      <NeonTube position={[x + w / 2, 15.3, z]} rotation={[Math.PI / 2, 0, 0]} length={d + 0.6} color="#00f5ff" intensity={rail} />
      <Theater night={night} />
      <FlyoverPad night={night} />
      <pointLight position={[x, 14, z]} intensity={night ? 420 : 0} distance={95} decay={2} color="#7c4dff" />
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
