import type { GameRunner } from "../GameShell";

/** Star Swarm: a Galaga-style fixed shooter. Enemies sit in formation, peel off in dives, drop bombs. Arrows/A-D move, Space fires. */
export const runSwarm: GameRunner = (canvas, onScore, onEnd) => {
  const ctx = canvas.getContext("2d")!;
  const W = canvas.width, H = canvas.height;
  type Enemy = { x: number; y: number; hx: number; hy: number; kind: number; mode: "form" | "dive" | "return"; t: number; path: { x: number; y: number }[]; hp: number };
  const keys = new Set<string>();
  let px = W / 2, lives = 3, score = 0, wave = 1, alive = true, raf = 0, last = 0, fireCd = 0, inv = 0, swing = 0;
  let shots: { x: number; y: number }[] = [], bombs: { x: number; y: number; vx: number; vy: number }[] = [], sparks: { x: number; y: number; vx: number; vy: number; t: number }[] = [];
  let enemies: Enemy[] = [];
  const stars = Array.from({ length: 70 }, () => ({ x: Math.random() * W, y: Math.random() * H, s: 0.5 + Math.random() * 1.5 }));
  const spawnWave = () => {
    enemies = [];
    const cols = 8, rows = Math.min(5, 2 + wave);
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const hx = W / 2 + (c - (cols - 1) / 2) * 56, hy = 70 + r * 40;
      enemies.push({ x: hx + (c % 2 ? -W : W), y: -40, hx, hy, kind: r === 0 ? 2 : r < 3 ? 1 : 0, mode: "return", t: 0, path: [], hp: r === 0 ? 2 : 1 });
    }
  };
  spawnWave();
  const key = (e: KeyboardEvent, down: boolean) => { if (["ArrowLeft", "ArrowRight", "a", "d", "A", "D", " "].includes(e.key)) { e.preventDefault(); if (down) keys.add((e.key || "").toLowerCase()); else keys.delete((e.key || "").toLowerCase()); } };
  const kd = (e: KeyboardEvent) => key(e, true), ku = (e: KeyboardEvent) => key(e, false);
  let pointerX: number | null = null, pointerFire = false;
  const pm = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); pointerX = ((e.clientX - r.left) / r.width) * W; };
  const pd = (e: PointerEvent) => { pm(e); pointerFire = true; };
  const pu = () => { pointerFire = false; };
  window.addEventListener("keydown", kd); window.addEventListener("keyup", ku);
  canvas.addEventListener("pointermove", pm); canvas.addEventListener("pointerdown", pd); window.addEventListener("pointerup", pu);
  canvas.focus();
  const boom = (x: number, y: number, n = 10) => { for (let i = 0; i < n; i++) sparks.push({ x, y, vx: (Math.random() - 0.5) * 240, vy: (Math.random() - 0.5) * 240, t: 0.5 }); };
  const diveFor = (e: Enemy) => { const side = e.x < W / 2 ? -1 : 1; e.mode = "dive"; e.t = 0; e.path = [{ x: e.x, y: e.y }, { x: e.x + side * 120, y: e.y + 120 }, { x: px + side * 40, y: H - 90 }, { x: px - side * 160, y: H + 60 }]; };
  const bez = (p: { x: number; y: number }[], t: number) => { const u = 1 - t; return { x: u * u * u * p[0].x + 3 * u * u * t * p[1].x + 3 * u * t * t * p[2].x + t * t * t * p[3].x, y: u * u * u * p[0].y + 3 * u * u * t * p[1].y + 3 * u * t * t * p[2].y + t * t * t * p[3].y }; };
  const frame = (ts: number) => {
    if (!alive) return;
    const dt = Math.min(0.05, (ts - last) / 1000 || 0.016); last = ts;
    // player
    const dir = (keys.has("arrowleft") || keys.has("a") ? -1 : 0) + (keys.has("arrowright") || keys.has("d") ? 1 : 0);
    if (pointerX !== null) px += (pointerX - px) * Math.min(1, dt * 12); else px += dir * 320 * dt;
    px = Math.max(20, Math.min(W - 20, px));
    fireCd -= dt; inv -= dt; swing += dt;
    if ((keys.has(" ") || pointerFire) && fireCd <= 0 && shots.length < 3) { shots.push({ x: px, y: H - 40 }); fireCd = 0.22; }
    shots = shots.filter((s) => (s.y -= 520 * dt) > -10);
    // formation sway + dives
    const sway = Math.sin(swing * 1.2) * 24;
    for (const e of enemies) {
      if (e.mode === "form") { e.x = e.hx + sway; e.y = e.hy; }
      else if (e.mode === "return") { e.x += (e.hx + sway - e.x) * Math.min(1, dt * 3); e.y += (e.hy - e.y) * Math.min(1, dt * 3); if (Math.abs(e.y - e.hy) < 1 && Math.abs(e.x - e.hx - sway) < 2) e.mode = "form"; }
      else { e.t += dt * (0.45 + wave * 0.05); const p = bez(e.path, Math.min(1, e.t)); e.x = p.x; e.y = p.y; if (e.t >= 1) { e.x = e.hx; e.y = -30; e.mode = "return"; } if (Math.random() < dt * 0.8) bombs.push({ x: e.x, y: e.y + 10, vx: (px - e.x) * 0.4, vy: 200 + wave * 15 }); }
    }
    if (enemies.length && Math.random() < dt * (0.35 + wave * 0.08) && enemies.filter((e) => e.mode === "dive").length < 1 + Math.floor(wave / 2)) { const f = enemies.filter((e) => e.mode === "form"); if (f.length) diveFor(f[Math.floor(Math.random() * f.length)]); }
    bombs = bombs.filter((b) => { b.x += b.vx * dt; b.y += b.vy * dt; return b.y < H + 10; });
    // hits
    for (const s of shots) for (const e of enemies) if (Math.abs(s.x - e.x) < 14 && Math.abs(s.y - e.y) < 12) { s.y = -99; e.hp--; if (e.hp <= 0) { score += e.mode === "dive" ? 200 : e.kind === 2 ? 150 : e.kind === 1 ? 100 : 60; boom(e.x, e.y); e.y = -999; onScore(score); } }
    enemies = enemies.filter((e) => e.y > -500); shots = shots.filter((s) => s.y > -50);
    if (inv <= 0) {
      const hitBy = bombs.find((b) => Math.abs(b.x - px) < 14 && Math.abs(b.y - (H - 34)) < 14) || enemies.find((e) => e.mode === "dive" && Math.abs(e.x - px) < 18 && Math.abs(e.y - (H - 34)) < 16);
      if (hitBy) { lives--; inv = 2; boom(px, H - 34, 24); bombs = []; if (lives <= 0) { alive = false; draw(); onEnd(score); return; } }
    }
    if (enemies.length === 0) { score += 500 * wave; onScore(score); wave++; spawnWave(); }
    sparks = sparks.filter((p) => { p.x += p.vx * dt; p.y += p.vy * dt; return (p.t -= dt) > 0; });
    for (const s of stars) { s.y += s.s * 40 * dt; if (s.y > H) { s.y = 0; s.x = Math.random() * W; } }
    draw(); raf = requestAnimationFrame(frame);
  };
  const ship = (x: number, y: number, c: string, up = true) => { ctx.fillStyle = c; ctx.beginPath(); if (up) { ctx.moveTo(x, y - 14); ctx.lineTo(x + 12, y + 10); ctx.lineTo(x, y + 4); ctx.lineTo(x - 12, y + 10); } else { ctx.moveTo(x, y + 12); ctx.lineTo(x + 11, y - 8); ctx.lineTo(x, y - 3); ctx.lineTo(x - 11, y - 8); } ctx.closePath(); ctx.fill(); };
  const draw = () => {
    ctx.fillStyle = "#070a16"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#334155"; for (const s of stars) ctx.fillRect(s.x, s.y, s.s, s.s);
    for (const e of enemies) ship(e.x, e.y, e.kind === 2 ? "#ff5c8a" : e.kind === 1 ? "#5ee6c3" : "#ffcf5c", false);
    ctx.fillStyle = "#fff"; for (const s of shots) ctx.fillRect(s.x - 1.5, s.y - 8, 3, 10);
    ctx.fillStyle = "#ff6b6b"; for (const b of bombs) ctx.fillRect(b.x - 2, b.y - 4, 4, 8);
    if (inv <= 0 || Math.floor(inv * 10) % 2 === 0) ship(px, H - 34, "#e5e7eb");
    ctx.fillStyle = "#ffcf5c"; for (const p of sparks) ctx.fillRect(p.x, p.y, 3, 3);
    ctx.fillStyle = "#94a3b8"; ctx.font = "12px monospace"; ctx.textAlign = "right"; ctx.fillText(`wave ${wave}  ${"♥".repeat(Math.max(0, lives))}`, W - 10, 18); ctx.textAlign = "left";
  };
  raf = requestAnimationFrame(frame);
  return () => { alive = false; cancelAnimationFrame(raf); window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); canvas.removeEventListener("pointermove", pm); canvas.removeEventListener("pointerdown", pd); window.removeEventListener("pointerup", pu); };
};
