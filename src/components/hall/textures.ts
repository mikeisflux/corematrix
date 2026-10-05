"use client";
import * as THREE from "three";

const cache = new Map<string, THREE.CanvasTexture>();

export function shade(hex: string, amt: number): string {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l + amt)));
  return `#${c.getHexString()}`;
}
export function luminance(hex: string): number {
  const c = new THREE.Color(hex);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}
const mk = (w: number, h: number) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return [c, c.getContext("2d")!] as const; };
const finish = (c: HTMLCanvasElement, key: string, repeat?: [number, number]) => {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  cache.set(key, t);
  return t;
};
function fitText(g: CanvasRenderingContext2D, text: string, maxW: number, start: number, min: number, font: (px: number) => string) {
  let px = start;
  g.font = font(px);
  while (g.measureText(text).width > maxW && px > min) { px -= 2; g.font = font(px); }
  return px;
}

/**
 * The back-wall banner of a booth: name, tagline and logo in one of five styles.
 * 4:1 for inline booths and islands, drawn once per (name, colors, style).
 */
export function bannerTexture(o: { name: string; tagline?: string | null; color: string; accent: string; style: string; label?: string; wide?: boolean }): THREE.CanvasTexture {
  const key = `banner|${JSON.stringify(o)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const w = o.wide ? 1024 : 768, h = 256;
  const [c, g] = mk(w, h);
  const dark = luminance(o.color) < 0.35;
  const fg = dark ? "#ffffff" : "#0b0f1a";
  const name = (o.name || "Available").slice(0, 28);
  const sans = (px: number) => `800 ${px}px "Inter", "Helvetica Neue", Arial, sans-serif`;
  switch (o.style) {
    case "neon": {
      g.fillStyle = "#0a0a14"; g.fillRect(0, 0, w, h);
      g.strokeStyle = o.color; g.lineWidth = 6; g.strokeRect(14, 14, w - 28, h - 28);
      g.shadowColor = o.accent; g.shadowBlur = 28;
      g.fillStyle = o.accent; g.textAlign = "center"; g.textBaseline = "middle";
      const px = fitText(g, name.toUpperCase(), w - 80, 96, 40, (p) => `900 ${p}px "Inter", Arial, sans-serif`);
      g.font = `900 ${px}px "Inter", Arial, sans-serif`; g.fillText(name.toUpperCase(), w / 2, h * 0.42);
      g.shadowBlur = 0; g.fillStyle = o.color; g.font = "500 30px Arial, sans-serif";
      if (o.tagline) g.fillText(o.tagline.slice(0, 48), w / 2, h * 0.78);
      break;
    }
    case "comic": {
      g.fillStyle = o.accent; g.fillRect(0, 0, w, h);
      g.fillStyle = o.color;
      for (let y = 10; y < h; y += 18) for (let x = (y / 18) % 2 ? 9 : 0; x < w; x += 18) { g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill(); }
      // starburst
      g.save(); g.translate(w / 2, h / 2); g.fillStyle = o.color; g.beginPath();
      for (let i = 0; i < 36; i++) { const r = i % 2 ? w * 0.42 : w * 0.3, a = (i / 36) * Math.PI * 2; g.lineTo(Math.cos(a) * r, Math.sin(a) * r * 0.55); }
      g.closePath(); g.fill(); g.restore();
      g.fillStyle = luminance(o.color) < 0.4 ? "#fff" : "#111"; g.textAlign = "center"; g.textBaseline = "middle";
      const px = fitText(g, name.toUpperCase(), w * 0.52, 84, 36, (p) => `900 ${p}px Impact, "Arial Black", sans-serif`);
      g.font = `900 ${px}px Impact, "Arial Black", sans-serif`; g.lineWidth = 8; g.strokeStyle = "#111"; g.strokeText(name.toUpperCase(), w / 2, h * 0.47); g.fillStyle = "#fff"; g.fillText(name.toUpperCase(), w / 2, h * 0.47);
      if (o.tagline) { g.fillStyle = "#111"; g.font = "700 26px Arial, sans-serif"; g.fillText(o.tagline.slice(0, 46), w / 2, h * 0.86); }
      break;
    }
    case "minimal": {
      g.fillStyle = "#fafafa"; g.fillRect(0, 0, w, h);
      g.fillStyle = o.color; g.fillRect(0, h - 14, w, 14);
      g.fillStyle = "#111827"; g.textAlign = "left"; g.textBaseline = "middle";
      const px = fitText(g, name, w - 120, 80, 36, (p) => `600 ${p}px "Inter", Arial, sans-serif`);
      g.font = `600 ${px}px "Inter", Arial, sans-serif`; g.fillText(name, 60, h * 0.42);
      g.fillStyle = "#6b7280"; g.font = "400 28px Arial, sans-serif";
      if (o.tagline) g.fillText(o.tagline.slice(0, 54), 62, h * 0.72);
      if (o.label) { g.textAlign = "right"; g.fillStyle = o.color; g.font = "700 26px ui-monospace, monospace"; g.fillText(`#${o.label}`, w - 40, 40); }
      break;
    }
    case "retro": {
      const stripes = [o.color, shade(o.color, 0.18), o.accent, shade(o.color, -0.15)];
      for (let i = 0; i < 4; i++) { g.fillStyle = stripes[i]; g.fillRect(0, (h / 4) * i, w, h / 4); }
      g.fillStyle = "#1a1208"; g.fillRect(70, 48, w - 140, h - 96);
      g.fillStyle = "#ffe9a3"; g.textAlign = "center"; g.textBaseline = "middle";
      const px = fitText(g, name.toUpperCase(), w - 220, 78, 34, (p) => `700 ${p}px Georgia, "Times New Roman", serif`);
      g.font = `700 ${px}px Georgia, "Times New Roman", serif`; g.fillText(name.toUpperCase(), w / 2, h * 0.46);
      g.fillStyle = "#f5deb3"; g.font = "italic 400 26px Georgia, serif";
      if (o.tagline) g.fillText(o.tagline.slice(0, 48), w / 2, h * 0.72);
      break;
    }
    default: {
      const grad = g.createLinearGradient(0, 0, w, h);
      grad.addColorStop(0, o.color); grad.addColorStop(1, shade(o.color, -0.12));
      g.fillStyle = grad; g.fillRect(0, 0, w, h);
      g.fillStyle = o.accent; g.fillRect(0, 0, 18, h);
      g.fillStyle = fg; g.textAlign = "left"; g.textBaseline = "middle";
      const px = fitText(g, name, w - 160, 86, 36, sans);
      g.font = sans(px); g.fillText(name, 60, o.tagline ? h * 0.4 : h * 0.5);
      if (o.tagline) { g.globalAlpha = 0.85; g.font = "500 30px Arial, sans-serif"; g.fillText(o.tagline.slice(0, 52), 62, h * 0.74); g.globalAlpha = 1; }
      if (o.label) { g.textAlign = "right"; g.globalAlpha = 0.7; g.font = "700 24px ui-monospace, monospace"; g.fillText(o.label, w - 32, 36); g.globalAlpha = 1; }
    }
  }
  return finish(c, key);
}

/** Text on a board: aisle numbers, hall letters, hanging signs, billboards. */
export function signTexture(lines: string[], opts: { bg?: string; fg?: string; w?: number; h?: number; size?: number; accentBar?: string; font?: string } = {}): THREE.CanvasTexture {
  const key = `sign|${lines.join("\n")}|${JSON.stringify(opts)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const w = opts.w ?? 256, h = opts.h ?? 128;
  const [c, g] = mk(w, h);
  g.fillStyle = opts.bg ?? "#fff8dc"; g.fillRect(0, 0, w, h);
  if (opts.accentBar) { g.fillStyle = opts.accentBar; g.fillRect(0, 0, w, 10); }
  g.fillStyle = opts.fg ?? "#111"; g.textAlign = "center"; g.textBaseline = "middle";
  const size = opts.size ?? 28;
  g.font = `bold ${size}px ${opts.font ?? '"Inter", Arial, sans-serif'}`;
  const lh = size * 1.2;
  const y0 = h / 2 - ((lines.length - 1) * lh) / 2;
  lines.forEach((l, i) => { const px = fitText(g, l, w - 24, size, 10, (p) => `bold ${p}px ${opts.font ?? '"Inter", Arial, sans-serif'}`); g.font = `bold ${px}px ${opts.font ?? '"Inter", Arial, sans-serif'}`; g.fillText(l, w / 2, y0 + i * lh); });
  return finish(c, key);
}

/** Carpet / concrete with a little grain. */
export function floorTexture(kind: "concrete" | "carpet" | "cross" | "arcade", repeat: [number, number]): THREE.CanvasTexture {
  const key = `floor|${kind}|${repeat.join("x")}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, g] = mk(128, 128);
  const [a, b] = kind === "concrete" ? ["#b7b4ad", "#aaa79f"] : kind === "carpet" ? ["#1d3a8a", "#1a3277"] : kind === "cross" ? ["#8c1d2b", "#7a1826"] : ["#15112a", "#1c1740"];
  g.fillStyle = a; g.fillRect(0, 0, 128, 128);
  g.fillStyle = b;
  let seed = 11;
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 900; i++) g.fillRect(Math.floor(r() * 128), Math.floor(r() * 128), 1 + Math.floor(r() * 2), 1);
  if (kind === "arcade") { g.strokeStyle = "#5b4bff"; g.lineWidth = 2; g.strokeRect(0, 0, 128, 128); }
  return finish(c, key, repeat);
}

/** Drape fabric: vertical folds. */
export function drapeTexture(color: string): THREE.CanvasTexture {
  const key = `drape|${color}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, g] = mk(128, 64);
  for (let x = 0; x < 128; x++) { const t = (Math.sin((x / 128) * Math.PI * 10) + 1) / 2; g.fillStyle = shade(color, -0.12 + t * 0.16); g.fillRect(x, 0, 1, 64); }
  return finish(c, key, [4, 1]);
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
