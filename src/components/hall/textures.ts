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

/* ---------- drawing helpers for the generated signage ---------- */
type Ctx = CanvasRenderingContext2D;
const rgba = (hex: string, a: number) => { const c = new THREE.Color(hex); return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`; };
const rr = (g: Ctx, x: number, y: number, w: number, h: number, r: number) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
const spaced = (g: Ctx, px: number) => { try { (g as Ctx & { letterSpacing: string }).letterSpacing = `${px}px`; } catch { /* older canvas */ } };
/** Evenly spaced halftone dots with a horizontal fade. */
function halftone(g: Ctx, w: number, h: number, color: string, step: number, from: number, to: number) {
  for (let y = step / 2; y < h; y += step) for (let x = ((y / step) % 2 ? step / 2 : 0) + step / 2; x < w; x += step) {
    const t = Math.max(0, Math.min(1, (x / w - from) / (to - from)));
    const r = (step / 2) * 0.9 * t; if (r < 0.4) continue;
    g.fillStyle = color; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
}
/** Sunburst rays from a point, alternating two fills. */
function rays(g: Ctx, cx: number, cy: number, radius: number, count: number, a: string, b: string) {
  for (let i = 0; i < count; i++) { const a0 = (i / count) * Math.PI * 2, a1 = ((i + 1) / count) * Math.PI * 2; g.fillStyle = i % 2 ? a : b; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a0) * radius, cy + Math.sin(a0) * radius); g.lineTo(cx + Math.cos(a1) * radius, cy + Math.sin(a1) * radius); g.closePath(); g.fill(); }
}
/** Split one line in two at the space nearest the middle (for long names on narrow signs). */
function splitLine(text: string): [string, string] | null {
  if (text.indexOf(" ") < 0) return null;
  let best = -1, bestD = Infinity;
  for (let k = text.indexOf(" "); k >= 0; k = text.indexOf(" ", k + 1)) { const d = Math.abs(k - text.length / 2); if (d < bestD) { bestD = d; best = k; } }
  return [text.slice(0, best), text.slice(best + 1)];
}

/**
 * The back-wall banner of a booth: name, tagline and booth label in one of five
 * designed vinyl-banner looks. 4:1 for inline booths and islands, drawn once per
 * (name, colors, style) and cached.
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
  const tagline = o.tagline?.slice(0, 52) ?? "";
  const sans = (wgt: number) => (px: number) => `${wgt} ${px}px "Inter", "Helvetica Neue", Arial, sans-serif`;
  const display = (px: number) => `900 ${px}px Impact, "Arial Black", "Helvetica Neue", sans-serif`;
  const serif = (px: number) => `700 ${px}px Georgia, "Times New Roman", serif`;
  g.textBaseline = "middle";
  switch (o.style) {
    case "neon": {
      // black vinyl, faint grid, double neon frame, tube lettering with a hot core
      g.fillStyle = "#07070f"; g.fillRect(0, 0, w, h);
      g.strokeStyle = rgba(o.color, 0.16); g.lineWidth = 1;
      for (let x = 24; x < w; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
      for (let y = 24; y < h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
      const bottom = g.createLinearGradient(0, h * 0.5, 0, h); bottom.addColorStop(0, "rgba(0,0,0,0)"); bottom.addColorStop(1, rgba(o.color, 0.35)); g.fillStyle = bottom; g.fillRect(0, 0, w, h);
      g.shadowColor = o.color; g.shadowBlur = 18; g.strokeStyle = o.color; g.lineWidth = 5; rr(g, 16, 16, w - 32, h - 32, 10); g.stroke();
      g.shadowBlur = 0; g.strokeStyle = rgba("#ffffff", 0.7); g.lineWidth = 1.5; rr(g, 16, 16, w - 32, h - 32, 10); g.stroke();
      g.textAlign = "center";
      const px = fitText(g, name.toUpperCase(), w - 120, 96, 40, sans(900));
      g.font = sans(900)(px); spaced(g, 4);
      const ny = tagline ? h * 0.42 : h * 0.5;
      g.shadowColor = o.accent; g.shadowBlur = 36; g.fillStyle = o.accent; g.fillText(name.toUpperCase(), w / 2, ny); g.fillText(name.toUpperCase(), w / 2, ny);
      g.shadowBlur = 10; g.fillStyle = "#ffffff"; g.globalAlpha = 0.85; g.fillText(name.toUpperCase(), w / 2, ny); g.globalAlpha = 1;
      g.shadowBlur = 0; spaced(g, 0);
      if (tagline) {
        g.shadowColor = o.color; g.shadowBlur = 14; g.strokeStyle = o.color; g.lineWidth = 2;
        g.beginPath(); g.moveTo(w * 0.2, h * 0.64); g.lineTo(w * 0.8, h * 0.64); g.stroke(); g.shadowBlur = 0;
        g.fillStyle = o.color; g.font = sans(500)(28); spaced(g, 3); g.fillText(tagline.toUpperCase(), w / 2, h * 0.79); spaced(g, 0);
      }
      if (o.label) { g.textAlign = "right"; g.fillStyle = rgba("#ffffff", 0.55); g.font = "600 20px ui-monospace, monospace"; g.fillText(o.label, w - 34, 38); }
      break;
    }
    case "comic": {
      // halftone sky, action burst with a thick outline, Impact lettering with a drop block, ribbon tagline
      g.fillStyle = o.accent; g.fillRect(0, 0, w, h);
      halftone(g, w, h, rgba(o.color, 0.9), 18, 0.15, 1.0);
      rays(g, w * 0.5, h * 0.55, w, 28, rgba("#ffffff", 0.14), "rgba(0,0,0,0)");
      g.save(); g.translate(w / 2, h / 2); g.beginPath();
      for (let i = 0; i < 40; i++) { const r = i % 2 ? w * 0.44 : w * 0.33, a = (i / 40) * Math.PI * 2; g.lineTo(Math.cos(a) * r, Math.sin(a) * r * 0.5); }
      g.closePath(); g.lineWidth = 10; g.strokeStyle = "#111111"; g.stroke(); g.fillStyle = o.color; g.fill(); g.restore();
      g.textAlign = "center";
      const px = fitText(g, name.toUpperCase(), w * 0.56, 92, 36, display);
      g.font = display(px); const ny = tagline ? h * 0.44 : h * 0.5;
      g.fillStyle = "#111111"; g.fillText(name.toUpperCase(), w / 2 + 6, ny + 7);
      g.lineWidth = 9; g.strokeStyle = "#111111"; g.lineJoin = "round"; g.strokeText(name.toUpperCase(), w / 2, ny);
      g.fillStyle = "#ffffff"; g.fillText(name.toUpperCase(), w / 2, ny);
      if (tagline) {
        g.save(); g.translate(w / 2, h * 0.84); g.rotate(-0.035);
        g.font = sans(800)(24); const tw = g.measureText(tagline.toUpperCase()).width + 48;
        g.fillStyle = "#111111"; rr(g, -tw / 2, -22, tw, 44, 6); g.fill();
        g.fillStyle = "#ffffff"; g.fillText(tagline.toUpperCase(), 0, 1); g.restore();
      }
      if (o.label) { g.fillStyle = "#111111"; rr(g, 22, 22, 26 + o.label.length * 13, 36, 6); g.fill(); g.textAlign = "left"; g.fillStyle = "#ffffff"; g.font = "800 20px ui-monospace, monospace"; g.fillText(o.label, 34, 40); }
      break;
    }
    case "minimal": {
      // off-white vinyl with a hairline frame, a brand mark square, light type and a colour rule
      const paper = g.createLinearGradient(0, 0, 0, h); paper.addColorStop(0, "#fcfcfb"); paper.addColorStop(1, "#f1f1ef"); g.fillStyle = paper; g.fillRect(0, 0, w, h);
      g.strokeStyle = rgba("#111827", 0.12); g.lineWidth = 1.5; g.strokeRect(18.5, 18.5, w - 37, h - 37);
      g.fillStyle = o.color; g.fillRect(0, h - 12, w, 12);
      g.fillStyle = o.color; rr(g, 60, h * 0.42 - 24, 48, 48, 8); g.fill();
      g.fillStyle = luminance(o.color) < 0.4 ? "#ffffff" : "#0b0f1a"; g.textAlign = "center"; g.font = sans(800)(28); g.fillText(name.trim().charAt(0).toUpperCase(), 84, h * 0.42 + 1);
      g.fillStyle = "#111827"; g.textAlign = "left";
      const px = fitText(g, name, w - 200, 76, 34, sans(500));
      g.font = sans(500)(px); spaced(g, -1); g.fillText(name, 132, h * 0.42); spaced(g, 0);
      g.fillStyle = o.color; g.fillRect(132, h * 0.6, 56, 3);
      if (tagline) { g.fillStyle = "#6b7280"; g.font = sans(400)(26); g.fillText(tagline, 132, h * 0.76); }
      if (o.label) { g.textAlign = "right"; g.fillStyle = o.color; g.font = "600 22px ui-monospace, monospace"; spaced(g, 2); g.fillText(o.label.toUpperCase(), w - 44, 46); spaced(g, 0); }
      break;
    }
    case "retro": {
      // sunburst in the brand colours, racing stripes along the bottom, a cream-trimmed plaque with serif caps
      g.fillStyle = shade(o.color, -0.05); g.fillRect(0, 0, w, h);
      rays(g, w / 2, h * 0.5, w, 36, shade(o.color, 0.1), shade(o.color, -0.08));
      const stripes = [o.accent, "#f5deb3", shade(o.color, 0.25), shade(o.color, -0.2)];
      for (let i = 0; i < 4; i++) { g.fillStyle = stripes[i]; g.fillRect(0, h - 44 + i * 11, w, 11); }
      g.fillStyle = "#1a1208"; rr(g, 64, 30, w - 128, h - 108, 14); g.fill();
      g.strokeStyle = "#f5deb3"; g.lineWidth = 3; rr(g, 72, 38, w - 144, h - 124, 10); g.stroke();
      g.strokeStyle = rgba("#f5deb3", 0.5); g.lineWidth = 1; rr(g, 80, 46, w - 160, h - 140, 8); g.stroke();
      g.textAlign = "center";
      const px = fitText(g, name.toUpperCase(), w - 240, 74, 32, serif);
      g.font = serif(px); spaced(g, 3); g.fillStyle = "#ffe9a3"; g.fillText(name.toUpperCase(), w / 2, tagline ? h * 0.4 : h * 0.47); spaced(g, 0);
      if (tagline) {
        g.fillStyle = "#f5deb3"; g.font = `italic 400 24px Georgia, serif`;
        const tw = g.measureText(tagline).width; g.fillText(tagline, w / 2, h * 0.67);
        g.font = "400 18px Georgia, serif"; g.fillText("★", w / 2 - tw / 2 - 24, h * 0.67); g.fillText("★", w / 2 + tw / 2 + 24, h * 0.67);
      }
      if (o.label) { g.fillStyle = "#1a1208"; g.font = "700 18px Georgia, serif"; spaced(g, 2); g.fillText(`BOOTH ${o.label}`.toUpperCase(), w / 2, h - 60); spaced(g, 0); }
      break;
    }
    default: {
      // classic: diagonal brand gradient, accent edge, a soft arc of light, bold name with a shadow, label chip
      const grad = g.createLinearGradient(0, 0, w, h); grad.addColorStop(0, shade(o.color, 0.06)); grad.addColorStop(1, shade(o.color, -0.16));
      g.fillStyle = grad; g.fillRect(0, 0, w, h);
      const glow = g.createRadialGradient(w * 0.86, h * 0.1, 10, w * 0.86, h * 0.1, w * 0.5); glow.addColorStop(0, rgba(o.accent, 0.28)); glow.addColorStop(1, rgba(o.accent, 0)); g.fillStyle = glow; g.fillRect(0, 0, w, h);
      g.fillStyle = rgba("#000000", 0.12); g.fillRect(0, h - 56, w, 56);
      g.fillStyle = o.accent; g.fillRect(0, 0, 16, h);
      g.strokeStyle = rgba(fg, 0.22); g.lineWidth = 1.5; g.strokeRect(30.5, 16.5, w - 47, h - 33);
      g.textAlign = "left"; g.fillStyle = fg; g.shadowColor = "rgba(0,0,0,0.35)"; g.shadowBlur = 10; g.shadowOffsetY = 3;
      const px = fitText(g, name, w - 180, 86, 36, sans(800));
      g.font = sans(800)(px); spaced(g, -1); g.fillText(name, 62, tagline ? h * 0.4 : h * 0.5); spaced(g, 0);
      g.shadowBlur = 0; g.shadowOffsetY = 0;
      if (tagline) { g.fillStyle = rgba(fg, 0.82); g.font = sans(500)(28); g.fillText(tagline, 64, h * 0.75); }
      if (o.label) { g.fillStyle = o.accent; const lw = 30 + o.label.length * 13; rr(g, w - 40 - lw, 30, lw, 34, 17); g.fill(); g.textAlign = "center"; g.fillStyle = luminance(o.accent) < 0.4 ? "#ffffff" : "#0b0f1a"; g.font = "700 18px ui-monospace, monospace"; g.fillText(o.label.toUpperCase(), w - 40 - lw / 2, 48); }
    }
  }
  return finish(c, key);
}

/**
 * Text on a board: aisle numbers, hall letters, hanging signs, billboards, roll-ups.
 * Portrait boards (taller than 1.8x their width) get a poster layout: the first
 * line is the headline (wrapped onto two lines when it would otherwise shrink),
 * the rest sit beneath it at a smaller size.
 */
export function signTexture(lines: string[], opts: { bg?: string; fg?: string; w?: number; h?: number; size?: number; accentBar?: string; font?: string } = {}): THREE.CanvasTexture {
  const key = `sign|${lines.join("\n")}|${JSON.stringify(opts)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const w = opts.w ?? 256, h = opts.h ?? 128;
  const [c, g] = mk(w, h);
  const bg = opts.bg ?? "#fff8dc", fg = opts.fg ?? "#111";
  const family = opts.font ?? '"Inter", Arial, sans-serif';
  const font = (wgt: string) => (px: number) => `${wgt} ${px}px ${family}`;
  const grad = g.createLinearGradient(0, 0, 0, h); grad.addColorStop(0, shade(bg, 0.03)); grad.addColorStop(1, shade(bg, -0.05));
  g.fillStyle = grad; g.fillRect(0, 0, w, h);
  const inset = Math.max(6, Math.round(Math.min(w, h) * 0.04));
  g.strokeStyle = rgba(fg, 0.16); g.lineWidth = Math.max(1, Math.round(Math.min(w, h) / 160)); g.strokeRect(inset + 0.5, inset + 0.5, w - inset * 2 - 1, h - inset * 2 - 1);
  const bar = opts.accentBar ? Math.max(8, Math.round(h * 0.04)) : 0;
  if (opts.accentBar) { g.fillStyle = opts.accentBar; g.fillRect(0, 0, w, bar); g.fillRect(0, h - Math.round(bar * 0.5), w, Math.round(bar * 0.5)); }
  g.fillStyle = fg; g.textAlign = "center"; g.textBaseline = "middle";
  const size = opts.size ?? 28;
  const portrait = h >= w * 1.8 && lines.length > 0;
  if (portrait) {
    // poster: headline (up to two lines) in the top third, a short rule, the rest beneath
    const title = lines[0];
    let titleLines = [title];
    let px = fitText(g, title, w - inset * 4, size, 10, font("800"));
    if (px < size * 0.72) { const sp = splitLine(title); if (sp) { titleLines = sp; px = Math.min(...sp.map((t) => fitText(g, t, w - inset * 4, size, 10, font("800")))); } }
    const lh = px * 1.1;
    const y0 = h * 0.3 - ((titleLines.length - 1) * lh) / 2;
    g.font = font("800")(px); spaced(g, -px * 0.02);
    titleLines.forEach((t, i) => g.fillText(t, w / 2, y0 + i * lh)); spaced(g, 0);
    const ruleY = y0 + (titleLines.length - 0.5) * lh + px * 0.55;
    g.fillStyle = opts.accentBar ?? rgba(fg, 0.5); g.fillRect(w / 2 - w * 0.12, ruleY, w * 0.24, Math.max(2, Math.round(h / 240)));
    const rest = lines.slice(1);
    const small = size * 0.62, slh = small * 1.25;
    g.fillStyle = rgba(fg, 0.88);
    rest.forEach((l, i) => { if (!l) return; const p = fitText(g, l, w - inset * 4, small, 8, font("600")); g.font = font("600")(p); g.fillText(l, w / 2, ruleY + small * 1.2 + i * slh); });
    return finish(c, key);
  }
  const lh = size * 1.2;
  const y0 = h / 2 - ((lines.length - 1) * lh) / 2;
  lines.forEach((l, i) => { const px = fitText(g, l, w - inset * 4, size, 10, font("bold")); g.font = font("bold")(px); g.fillText(l, w / 2, y0 + i * lh); });
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

/**
 * Drape fabric: gathered vertical folds with a soft highlight on each fold, a
 * narrow crease shadow, a little weave noise and a slightly tighter heading at
 * the top where the fabric hangs from the rod. Tiles 4x across a panel.
 */
export function drapeTexture(color: string): THREE.CanvasTexture {
  const key = `drape|${color}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const W = 256, H = 128;
  const [c, g] = mk(W, H);
  // ten folds of slightly uneven width that tile exactly
  let seed = 7; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const widths = Array.from({ length: 8 }, () => 0.8 + r() * 0.4); const total = widths.reduce((a, b) => a + b, 0);
  let x0 = 0;
  for (const fw of widths) {
    const px = (fw / total) * W, x1 = x0 + px;
    for (let x = Math.floor(x0); x < Math.ceil(x1) && x < W; x++) {
      const t = ((x + 0.5 - x0) / px) % 1; // 0 at the crease, 0.5 at the fold's crest
      const crest = Math.pow(0.5 + 0.5 * Math.cos((t - 0.5) * Math.PI * 2), 1.2); // broad highlight on the crest
      const crease = Math.exp(-Math.pow((t < 0.5 ? t : 1 - t) / 0.1, 2)); // soft shadow in the crease
      g.fillStyle = shade(color, -0.07 + crest * 0.12 - crease * 0.05); g.fillRect(x, 0, 1, H);
    }
    x0 = x1;
  }
  // heading: tighter gathers at the rod, slightly darker; hem: a touch darker
  const top = g.createLinearGradient(0, 0, 0, H * 0.14); top.addColorStop(0, "rgba(0,0,0,0.16)"); top.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = top; g.fillRect(0, 0, W, H * 0.14);
  const bottom = g.createLinearGradient(0, H * 0.9, 0, H); bottom.addColorStop(0, "rgba(0,0,0,0)"); bottom.addColorStop(1, "rgba(0,0,0,0.12)"); g.fillStyle = bottom; g.fillRect(0, H * 0.9, W, H * 0.1);
  for (let i = 0; i < 2600; i++) { g.fillStyle = r() > 0.5 ? "rgba(255,255,255,0.035)" : "rgba(0,0,0,0.04)"; g.fillRect(Math.floor(r() * W), Math.floor(r() * H), 1, 1 + Math.floor(r() * 2)); }
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
