"use client";
import * as THREE from "three";

const cache = new Map<string, THREE.CanvasTexture>();

function shade(hex: string, amt: number): string {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + amt)));
  return `#${c.getHexString()}`;
}

/**
 * Facade texture: 4 floors tall, tiled vertically by floor count.
 * Styles map to Claim Avenue's "window patterns" and a bit more.
 */
export function facadeTexture(color: string, style: string, night: boolean): THREE.CanvasTexture {
  const key = `${color}|${style}|${night ? "n" : "d"}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const w = 64, h = 128;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  const base = night ? shade(color, -0.25) : color;
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  const lit = night ? "#ffe9a3" : shade(color, 0.28);
  const dark = night ? shade(color, -0.35) : shade(color, -0.18);
  const floorH = h / 4;
  const rnd = mulberry(hashStr(key));
  for (let f = 0; f < 4; f++) {
    const y = f * floorH;
    switch (style) {
      case "glass": {
        g.fillStyle = night ? "#8fb8ff" : shade(color, 0.22);
        g.globalAlpha = 0.85;
        g.fillRect(2, y + 2, w - 4, floorH - 4);
        g.globalAlpha = 1;
        g.fillStyle = dark;
        for (let x = 0; x < w; x += 16) g.fillRect(x, y, 1, floorH);
        g.fillRect(0, y + floorH - 2, w, 2);
        break;
      }
      case "brick": {
        g.fillStyle = shade(color, -0.08);
        for (let r = 0; r < 4; r++) for (let x = (r % 2) * 8; x < w; x += 16) g.fillRect(x, y + r * 8, 14, 6);
        g.fillStyle = night && rnd() > 0.4 ? lit : dark;
        g.fillRect(12, y + 8, 14, 16);
        g.fillStyle = night && rnd() > 0.4 ? lit : dark;
        g.fillRect(38, y + 8, 14, 16);
        break;
      }
      case "neon": {
        g.fillStyle = shade(color, -0.2);
        g.fillRect(0, y, w, floorH);
        g.fillStyle = night ? "#00f5ff" : shade(color, 0.35);
        g.fillRect(0, y + 4, w, 3);
        g.fillStyle = night ? "#ff2bd6" : shade(color, 0.3);
        g.fillRect(0, y + floorH - 7, w, 3);
        g.fillStyle = night ? lit : dark;
        for (let x = 6; x < w; x += 14) g.fillRect(x, y + 11, 8, 10);
        break;
      }
      case "deco": {
        g.fillStyle = shade(color, -0.12);
        for (let x = 4; x < w; x += 12) g.fillRect(x, y, 2, floorH);
        g.fillStyle = night && rnd() > 0.5 ? lit : dark;
        for (let x = 8; x < w; x += 12) g.fillRect(x, y + 6, 6, 18);
        g.fillStyle = shade(color, 0.3);
        g.fillRect(0, y, w, 2);
        break;
      }
      default: {
        // modern: paired windows per floor
        for (let x = 6; x < w; x += 15) {
          g.fillStyle = night ? (rnd() > 0.35 ? lit : dark) : dark;
          g.fillRect(x, y + 7, 9, 16);
        }
        g.fillStyle = shade(color, -0.1);
        g.fillRect(0, y + floorH - 2, w, 2);
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.LinearMipMapLinearFilter;
  t.anisotropy = 4;
  cache.set(key, t);
  return t;
}

/** Sign texture: text on a colored board. Used for plot signs, billboards and labels. */
export function signTexture(lines: string[], opts: { bg?: string; fg?: string; w?: number; h?: number; size?: number; accentBar?: string } = {}): THREE.CanvasTexture {
  const key = `sign|${lines.join("\n")}|${JSON.stringify(opts)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const w = opts.w ?? 256, h = opts.h ?? 128;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.fillStyle = opts.bg ?? "#fff8dc";
  g.fillRect(0, 0, w, h);
  if (opts.accentBar) {
    g.fillStyle = opts.accentBar;
    g.fillRect(0, 0, w, 10);
  }
  g.fillStyle = opts.fg ?? "#111";
  g.textAlign = "center";
  g.textBaseline = "middle";
  const size = opts.size ?? 28;
  g.font = `bold ${size}px ui-monospace, Menlo, monospace`;
  const lh = size * 1.25;
  const y0 = h / 2 - ((lines.length - 1) * lh) / 2;
  lines.forEach((l, i) => g.fillText(l.slice(0, 22), w / 2, y0 + i * lh));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  cache.set(key, t);
  return t;
}

const logoCache = new Map<string, THREE.Texture>();
const loader = new THREE.TextureLoader();
export function logoTexture(url: string): THREE.Texture {
  const hit = logoCache.get(url);
  if (hit) return hit;
  const t = loader.load(url);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  logoCache.set(url, t);
  return t;
}
export function dropLogo(url: string) {
  logoCache.get(url)?.dispose();
  logoCache.delete(url);
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
