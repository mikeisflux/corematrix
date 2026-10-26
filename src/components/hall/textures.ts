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

// ---- procedural surface helpers (deterministic, seam-safe for repeating tiles) ----
const prng = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const rgba = (hex: string, a: number) => { const c = new THREE.Color(hex); return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${a})`; };
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

/** Drape fabric: soft vertical folds with secondary ripples and a fine weave. */
export function drapeTexture(color: string): THREE.CanvasTexture {
  const key = `drape|${color}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const W = 256, H = 128;
  const [c, g] = mk(W, H);
  for (let x = 0; x < W; x++) {
    const u = (x / W) * Math.PI * 2;
    const t = 0.55 * Math.sin(u * 10) + 0.3 * Math.sin(u * 23 + 1.3) + 0.15 * Math.sin(u * 3 + 0.4); // -1..1
    g.fillStyle = shade(color, -0.14 + ((t + 1) / 2) * 0.24); g.fillRect(x, 0, 1, H);
  }
  grain(g, W, H, prng(5), 5000, color, 0.06, 0.6);
  // a touch of sheen on the fold crests
  g.globalAlpha = 0.06; g.fillStyle = "#ffffff";
  for (let x = 0; x < W; x++) if (Math.sin((x / W) * Math.PI * 20) > 0.92) g.fillRect(x, 0, 1, H);
  g.globalAlpha = 1;
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
