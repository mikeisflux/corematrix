"use client";
import * as THREE from "three";

/** Generated textures, keyed by their content. Bounded: the claim designer's live preview and the mascot's speech bubbles
 *  mint a new key per keystroke or line, so the oldest are evicted and their GPU copies freed. */
class TexCache extends Map<string, THREE.CanvasTexture> {
  constructor(private max: number) { super(); }
  get(k: string) { const v = super.get(k); if (v) { super.delete(k); super.set(k, v); } return v; }
  set(k: string, v: THREE.CanvasTexture) { super.set(k, v); while (this.size > this.max) { const [old, t] = this.entries().next().value as [string, THREE.CanvasTexture]; super.delete(old); t.dispose(); } return this; }
}
const cache = new TexCache(400);

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
export function signTexture(lines: string[], opts: { bg?: string; fg?: string; w?: number; h?: number; size?: number; accentBar?: string; font?: string; dy?: number } = {}): THREE.CanvasTexture {
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
  // `dy` nudges the block down as a share of the height: all-caps headlines sit high on a "middle" baseline
  const y0 = h / 2 + (opts.dy ?? 0) * h - ((lines.length - 1) * lh) / 2;
  lines.forEach((l, i) => { const px = fitText(g, l, w - inset * 4, size, 10, font("bold")); g.font = font("bold")(px); g.fillText(l, w / 2, y0 + i * lh); });
  return finish(c, key);
}

// ---- procedural surface helpers (deterministic, seam-safe for repeating tiles) ----
const prng = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
/** Single-pixel grain: `n` dots, each a random shade of `color` within ±amt lightness. */
function grain(g: CanvasRenderingContext2D, w: number, h: number, r: () => number, n: number, color: string, amt: number, alpha = 1) {
  const tones = Array.from({ length: 9 }, (_, i) => shade(color, -amt + (amt * 2 * i) / 8));
  g.globalAlpha = alpha;
  for (let i = 0; i < n; i++) { g.fillStyle = tones[Math.floor(r() * 9)]; g.fillRect(Math.floor(r() * w), Math.floor(r() * h), 1, 1); }
  g.globalAlpha = 1;
}
/** Soft blotches that wrap across the tile edges, so the repeat shows no seam. */
function mottle(g: CanvasRenderingContext2D, w: number, h: number, r: () => number, n: number, rMin: number, rMax: number, light: string, dark: string, alpha: number) {
  for (let i = 0; i < n; i++) {
    const x = r() * w, y = r() * h, rad = rMin + r() * (rMax - rMin);
    const c = r() < 0.5 ? light : dark;
    const dx = x < w / 2 ? w : -w, dy = y < h / 2 ? h : -h;
    for (const [ox, oy] of [[0, 0], [dx, 0], [0, dy], [dx, dy]]) {
      const grad = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
      grad.addColorStop(0, rgba(c, alpha)); grad.addColorStop(1, rgba(c, 0));
      g.fillStyle = grad; g.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
    }
  }
}
/** A joint line with a highlight on one side (saw cut, panel seam, mullion). */
function seam(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, dark: string, light: string) {
  g.fillStyle = dark; g.fillRect(x, y, w, h);
  g.fillStyle = light;
  if (w >= h) g.fillRect(x, y + h, w, 1); else g.fillRect(x + w, y, 1, h);
}

/**
 * Floor finishes. `concrete` is the raw slab under everything; `polished` the sealed concourse with
 * terrazzo fleck and saw-cut joints at every tile edge; `carpet` is a light neutral pile with a
 * border and 2 ft carpet-tile seams, meant to be tinted by the material/instance colour; `cross`
 * the woven red runner; `arcade` the neon grid. One tile = one `repeat` unit.
 */
export function floorTexture(kind: "concrete" | "polished" | "carpet" | "cross" | "arcade", repeat: [number, number], tint?: string): THREE.CanvasTexture {
  const key = `floor|${kind}|${repeat.join("x")}|${tint ?? ""}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const r = prng(kind.length * 7919 + 11);
  if (kind === "concrete" || kind === "polished") {
    const S = 512;
    const [c, g] = mk(S, S);
    const base = kind === "polished" ? "#c3c2bd" : "#aba8a1";
    g.fillStyle = base; g.fillRect(0, 0, S, S);
    mottle(g, S, S, r, 22, 40, 150, shade(base, 0.035), shade(base, -0.04), kind === "polished" ? 0.12 : 0.4);
    grain(g, S, S, r, kind === "polished" ? 5000 : 9000, base, 0.09, 0.8);
    if (kind === "polished") {
      // terrazzo fleck: a few colours of tiny chips
      for (const [col, n] of [["#2b2a2a", 700], ["#f2efe8", 900], ["#9c7b5a", 350], ["#6b7a8a", 300]] as const) {
        g.fillStyle = col; g.globalAlpha = 0.55;
        for (let i = 0; i < n; i++) g.fillRect(Math.floor(r() * S), Math.floor(r() * S), 1 + Math.floor(r() * 2), 1 + Math.floor(r() * 2));
      }
      g.globalAlpha = 1;
      // faint trowel sweep for a sealed sheen
      g.globalAlpha = 0.05; g.strokeStyle = "#ffffff"; g.lineWidth = 18;
      for (let i = -3; i < 8; i++) { g.beginPath(); g.moveTo(i * 90, 0); g.lineTo(i * 90 + 300, S); g.stroke(); }
      g.globalAlpha = 1;
    } else {
      // hairline cracks and tyre scuffs on the raw slab
      g.strokeStyle = rgba(shade(base, -0.22), 0.5); g.lineWidth = 1;
      for (let i = 0; i < 6; i++) { let x = r() * S, y = r() * S; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 60; y += (r() - 0.5) * 60; g.lineTo(x, y); } g.stroke(); }
    }
    // saw-cut expansion joints on the tile edges (they meet at every repeat and form the grid)
    const jd = shade(base, -0.3), jl = shade(base, 0.1);
    seam(g, 0, 0, S, 3, jd, jl); seam(g, 0, 0, 3, S, jd, jl);
    return finish(c, key, repeat);
  }
  if (kind === "carpet") {
    const S = 256;
    const [c, g] = mk(S, S);
    const base = tint ?? "#cfd4de";
    g.fillStyle = base; g.fillRect(0, 0, S, S);
    // cut pile: dense grain plus faint tufting rows
    grain(g, S, S, r, 26000, base, 0.1);
    g.globalAlpha = 0.08; g.fillStyle = shade(base, -0.3);
    for (let y = 0; y < S; y += 3) g.fillRect(0, y, S, 1);
    g.globalAlpha = 1;
    mottle(g, S, S, r, 10, 40, 110, shade(base, 0.05), shade(base, -0.05), 0.35);
    // 2 ft carpet-tile seams (tile = 10 ft)
    g.fillStyle = rgba(shade(base, -0.35), 0.14);
    for (let i = 0; i < 5; i++) { const p = Math.round((i * S) / 5); g.fillRect(p, 0, 1, S); g.fillRect(0, p, S, 1); }
    // border along both long edges: darker band with a light pinstripe
    const bw = 13;
    g.fillStyle = shade(base, -0.16); g.fillRect(0, 0, bw, S); g.fillRect(S - bw, 0, bw, S);
    g.fillStyle = shade(base, 0.16); g.fillRect(bw, 0, 2, S); g.fillRect(S - bw - 2, 0, 2, S);
    g.fillStyle = shade(base, -0.4); g.fillRect(0, 0, 1, S); g.fillRect(S - 1, 0, 1, S);
    return finish(c, key, repeat);
  }
  if (kind === "cross") {
    const S = 256;
    const [c, g] = mk(S, S);
    const base = tint ?? "#8e1c2c";
    g.fillStyle = base; g.fillRect(0, 0, S, S);
    // basket weave: 16 px blocks alternating warp / weft direction
    const B = 16, lt = shade(base, 0.09), dk = shade(base, -0.11);
    for (let by = 0; by < S / B; by++) for (let bx = 0; bx < S / B; bx++) {
      const x = bx * B, y = by * B, horiz = (bx + by) % 2 === 0;
      for (let k = 0; k < B; k += 4) {
        g.fillStyle = lt; if (horiz) g.fillRect(x, y + k, B, 1); else g.fillRect(x + k, y, 1, B);
        g.fillStyle = dk; if (horiz) g.fillRect(x, y + k + 2, B, 1); else g.fillRect(x + k + 2, y, 1, B);
      }
      g.fillStyle = rgba(dk, 0.6); if (horiz) g.fillRect(x, y, 1, B); else g.fillRect(x, y, B, 1);
    }
    grain(g, S, S, r, 7000, base, 0.08, 0.7);
    mottle(g, S, S, r, 8, 50, 120, shade(base, 0.05), shade(base, -0.06), 0.3);
    return finish(c, key, repeat);
  }
  // arcade: dark violet floor with a glowing grid
  const S = 256;
  const [c, g] = mk(S, S);
  g.fillStyle = "#130f28"; g.fillRect(0, 0, S, S);
  grain(g, S, S, r, 6000, "#1a1538", 0.1);
  g.strokeStyle = "#3b2fa8"; g.lineWidth = 1; g.globalAlpha = 0.5;
  g.beginPath(); g.moveTo(S / 2, 0); g.lineTo(S / 2, S); g.moveTo(0, S / 2); g.lineTo(S, S / 2); g.stroke();
  g.globalAlpha = 1; g.shadowColor = "#6d5bff"; g.shadowBlur = 10; g.strokeStyle = "#6a5cff"; g.lineWidth = 3;
  g.strokeRect(0, 0, S, S); g.shadowBlur = 0;
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

/**
 * Convention-centre wall: one tile is 80 ft wide by the full wall height (34 ft). Dark wainscot with
 * a kick plate, chair rail, acoustic panels with seams every 10 ft that darken toward the ceiling,
 * and a frieze under the roof line. `repeatX` is the wall length in 80 ft units.
 */
export function wallTexture(repeatX: number, height = 34): THREE.CanvasTexture {
  const key = `wall|${repeatX}|${height}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const W = 1024, H = 512, ppf = H / height, pw = W / 8; // 8 panels of 10 ft
  const Y = (ft: number) => Math.round(H - ft * ppf);
  const [c, g] = mk(W, H);
  const r = prng(77);
  // upper field: gradient, darker toward the ceiling
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "#2a3040"); grad.addColorStop(0.45, "#3b4354"); grad.addColorStop(1, "#424a5c");
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  // alternate panel tones for the acoustic panels
  for (let i = 0; i < 8; i++) { g.fillStyle = rgba(i % 2 ? "#ffffff" : "#000000", 0.035); g.fillRect(i * pw, 0, pw, H); }
  grain(g, W, H, r, 14000, "#3b4354", 0.07, 0.5);
  mottle(g, W, H, r, 12, 80, 260, "#4a5366", "#2b3140", 0.3);
  // panel seams
  for (let i = 0; i < 8; i++) seam(g, i * pw, 0, 2, H, "#1b1f29", "#5a6375");
  seam(g, 0, Y(20), W, 2, "#1b1f29", "#5a6375");
  // frieze at the top
  g.fillStyle = "#1f2430"; g.fillRect(0, 0, W, Y(height - 3));
  g.fillStyle = "#4b5468"; g.fillRect(0, Y(height - 3), W, 2);
  g.fillStyle = "#121620"; g.fillRect(0, 0, W, Y(height - 0.5));
  // wainscot: panelled every 5 ft, lighter at the top edge
  const wg = g.createLinearGradient(0, Y(7), 0, H);
  wg.addColorStop(0, "#2b3142"); wg.addColorStop(1, "#1e2230");
  g.fillStyle = wg; g.fillRect(0, Y(7), W, H - Y(7));
  for (let i = 0; i < 16; i++) { g.fillStyle = rgba(i % 2 ? "#ffffff" : "#000000", 0.04); g.fillRect(i * (pw / 2), Y(7), pw / 2, H - Y(7)); seam(g, i * (pw / 2), Y(7), 2, H - Y(7), "#151924", "#3a4254"); }
  // chair rail
  g.fillStyle = "#5c6678"; g.fillRect(0, Y(7.6), W, Y(7) - Y(7.6));
  g.fillStyle = "#7d879a"; g.fillRect(0, Y(7.6), W, 2);
  g.fillStyle = "#151924"; g.fillRect(0, Y(7), W, 2);
  // kick plate
  g.fillStyle = "#12161f"; g.fillRect(0, Y(0.9), W, H - Y(0.9));
  g.fillStyle = "#2a3040"; g.fillRect(0, Y(0.9), W, 1);
  const t = finish(c, key, [repeatX, 1]);
  t.anisotropy = 16;
  return t;
}

/** Ceiling deck: ribbed metal deck with purlin shadows every tile (tile = 8 ft). */
export function ceilingTexture(repeat: [number, number]): THREE.CanvasTexture {
  const key = `ceiling|${repeat.join("x")}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const S = 256;
  const [c, g] = mk(S, S);
  const base = "#20252f";
  g.fillStyle = base; g.fillRect(0, 0, S, S);
  for (let x = 0; x < S; x += 16) {
    g.fillStyle = shade(base, 0.04); g.fillRect(x, 0, 7, S);
    g.fillStyle = shade(base, -0.06); g.fillRect(x + 7, 0, 1, S);
    g.fillStyle = shade(base, 0.08); g.fillRect(x + 15, 0, 1, S);
  }
  grain(g, S, S, prng(9), 5000, base, 0.05, 0.5);
  // purlin: a dark bar with a soft shadow on one side
  const sh = g.createLinearGradient(0, 0, 0, 26);
  sh.addColorStop(0, rgba("#000000", 0.45)); sh.addColorStop(1, rgba("#000000", 0));
  g.fillStyle = sh; g.fillRect(0, 0, S, 26);
  g.fillStyle = "#171b24"; g.fillRect(0, 0, S, 6);
  g.fillStyle = "#3a4150"; g.fillRect(0, 6, S, 1);
  return finish(c, key, repeat);
}

/**
 * The glass front of an entrance: three pairs of doors under a transom, aluminium mullions, push
 * bars, and a reflection sweep. At night the lobby behind glows warm and the transom lamps are lit.
 * Drawn for a 22 x 14 ft opening.
 */
export function glassTexture(night: boolean): THREE.CanvasTexture {
  const key = `glass|${night ? "n" : "d"}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const W = 512, H = 320, ppf = W / 22;
  const Y = (ft: number) => Math.round(H - ft * (H / 14));
  const [c, g] = mk(W, H);
  // glass field
  const gl = g.createLinearGradient(0, 0, 0, H);
  if (night) { gl.addColorStop(0, "#0e1830"); gl.addColorStop(0.55, "#182a4a"); gl.addColorStop(1, "#0b1324"); }
  else { gl.addColorStop(0, "#bcd6ea"); gl.addColorStop(0.5, "#8fb0cf"); gl.addColorStop(1, "#6f8fae"); }
  g.fillStyle = gl; g.fillRect(0, 0, W, H);
  if (night) {
    // warm lobby light behind the doors
    const warm = g.createRadialGradient(W / 2, Y(5), 20, W / 2, Y(5), W * 0.55);
    warm.addColorStop(0, rgba("#ffd9a3", 0.75)); warm.addColorStop(0.5, rgba("#ffc27a", 0.3)); warm.addColorStop(1, rgba("#ffc27a", 0));
    g.fillStyle = warm; g.fillRect(0, 0, W, H);
    // lit lamps along the transom
    for (let i = 0; i < 6; i++) { const x = (i + 0.5) * (W / 6); const l = g.createRadialGradient(x, Y(12.2), 2, x, Y(12.2), 22); l.addColorStop(0, "#fff3d6"); l.addColorStop(0.3, rgba("#ffe0a8", 0.8)); l.addColorStop(1, rgba("#ffe0a8", 0)); g.fillStyle = l; g.fillRect(x - 22, Y(12.2) - 22, 44, 44); }
  } else {
    // ceiling light reflections and a diagonal sweep
    g.fillStyle = rgba("#ffffff", 0.35);
    for (let i = 0; i < 6; i++) { const x = (i + 0.5) * (W / 6); g.beginPath(); g.roundRect(x - 16, Y(12.6), 32, 7, 3); g.fill(); }
    g.save(); g.globalAlpha = 0.18; g.fillStyle = "#ffffff"; g.beginPath(); g.moveTo(60, H); g.lineTo(200, 0); g.lineTo(300, 0); g.lineTo(160, H); g.closePath(); g.fill();
    g.globalAlpha = 0.1; g.beginPath(); g.moveTo(330, H); g.lineTo(420, 0); g.lineTo(450, 0); g.lineTo(360, H); g.closePath(); g.fill(); g.restore();
  }
  // mullions: 6 leaves across, transom at 10.5 ft, bottom rail
  const mull = "#1c222e", hl = "#7a8496";
  const leaf = W / 6, mw = Math.round(ppf * 0.22);
  for (let i = 0; i <= 6; i++) { const x = Math.round(i * leaf) - (i === 6 ? mw : 0); seam(g, x, 0, mw, H, mull, hl); }
  seam(g, 0, Y(10.5), W, mw + 2, mull, hl);
  seam(g, 0, 0, W, mw + 2, mull, hl);
  g.fillStyle = mull; g.fillRect(0, Y(0.9), W, H - Y(0.9));
  g.fillStyle = hl; g.fillRect(0, Y(0.9), W, 1);
  // push bars on every leaf and a pull handle at each pair's meeting stile
  for (let i = 0; i < 6; i++) {
    const x = i * leaf;
    g.fillStyle = "#d7dce4"; g.fillRect(x + mw + 6, Y(3.3), leaf - mw - 12, Math.max(3, ppf * 0.16));
    g.fillStyle = "#8a93a3"; g.fillRect(x + mw + 6, Y(3.3) + Math.max(3, ppf * 0.16), leaf - mw - 12, 1);
    const hx = i % 2 === 0 ? x + leaf - mw - 8 : x + mw + 4;
    g.fillStyle = "#c9cfd8"; g.fillRect(hx, Y(4.6), 4, Y(2.6) - Y(4.6));
  }
  return finish(c, key);
}

/** The face of an LED wash fixture: a grid of bright cells on a dark chassis. Used as map and emissive map. */
export function ledTexture(): THREE.CanvasTexture {
  const key = "led";
  const hit = cache.get(key);
  if (hit) return hit;
  const W = 192, H = 64;
  const [c, g] = mk(W, H);
  g.fillStyle = "#1a1d24"; g.fillRect(0, 0, W, H);
  g.fillStyle = "#2a2e38"; g.fillRect(3, 3, W - 6, H - 6);
  const cols = 12, rows = 4, cw = (W - 6) / cols, ch = (H - 6) / rows;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const cx = 3 + (x + 0.5) * cw, cy = 3 + (y + 0.5) * ch;
    const rg = g.createRadialGradient(cx, cy, 0, cx, cy, Math.min(cw, ch) * 0.48);
    rg.addColorStop(0, "#ffffff"); rg.addColorStop(0.6, "#f4f7ff"); rg.addColorStop(1, rgba("#c9d2ff", 0));
    g.fillStyle = rg; g.beginPath(); g.arc(cx, cy, Math.min(cw, ch) * 0.48, 0, Math.PI * 2); g.fill();
  }
  return finish(c, key);
}

/** Horizontal ribbed metal (roll-up dock doors, cladding). Tile = 4 ft. */
export function ribbedTexture(color: string, repeat: [number, number]): THREE.CanvasTexture {
  const key = `ribbed|${color}|${repeat.join("x")}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const S = 128;
  const [c, g] = mk(S, S);
  g.fillStyle = color; g.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += 16) {
    const lg = g.createLinearGradient(0, y, 0, y + 16);
    lg.addColorStop(0, shade(color, 0.1)); lg.addColorStop(0.5, color); lg.addColorStop(1, shade(color, -0.14));
    g.fillStyle = lg; g.fillRect(0, y, S, 16);
    g.fillStyle = shade(color, -0.25); g.fillRect(0, y + 15, S, 1);
  }
  grain(g, S, S, prng(3), 2500, color, 0.05, 0.5);
  return finish(c, key, repeat);
}

const logoCache = new Map<string, THREE.Texture>();
const loader = new THREE.TextureLoader();
const framedCache = new TexCache(8);
/**
 * A tile for the spinning logo box: the booth colour with the logo fitted inside a margin, never cropped or stretched
 * whatever its shape. `aspect` is the tile's height over its width, so a tall face gets a tall tile with the logo
 * centred and colour above and below.
 */
export function framedLogoTexture(url: string, color: string, aspect = 1): THREE.CanvasTexture {
  const key = `${url}|${color}|${aspect}`;
  const hit = framedCache.get(key);
  if (hit) return hit;
  const W = 1024, H = Math.round(W * aspect), m = W * 0.07;
  const [c, g] = mk(W, H);
  g.fillStyle = color; g.fillRect(0, 0, W, H);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const img = new Image();
  img.onload = () => {
    const k = Math.min((W - 2 * m) / img.width, (H - 2 * m) / img.height);
    const w = img.width * k, h = img.height * k;
    g.fillStyle = color; g.fillRect(0, 0, W, H);
    g.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
    t.needsUpdate = true;
  };
  img.src = url;
  framedCache.set(key, t);
  return t;
}
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
