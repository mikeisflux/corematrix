import type { GameRunner } from "../GameShell";

/** Rock Field: asteroids. Left/right turn, up thrusts, space fires; rocks split. */
export const runRocks: GameRunner = (canvas, onScore, onEnd) => {
  const ctx = canvas.getContext("2d")!;
  const W = canvas.width, H = canvas.height;
  type Rock = { x: number; y: number; vx: number; vy: number; r: number; a: number; va: number; pts: number[] };
  const keys = new Set<string>();
  let x = W / 2, y = H / 2, vx = 0, vy = 0, ang = -Math.PI / 2, score = 0, lives = 3, inv = 2, alive = true, raf = 0, last = 0, cd = 0, level = 1;
  let shots: { x: number; y: number; vx: number; vy: number; t: number }[] = [];
  let rocks: Rock[] = [];
  const mk = (rx: number, ry: number, r: number): Rock => ({ x: rx, y: ry, vx: (Math.random() - 0.5) * (120 + level * 10), vy: (Math.random() - 0.5) * (120 + level * 10), r, a: 0, va: (Math.random() - 0.5) * 2, pts: Array.from({ length: 9 }, () => 0.7 + Math.random() * 0.4) });
  const field = () => { rocks = []; for (let i = 0; i < 3 + level; i++) { let rx, ry; do { rx = Math.random() * W; ry = Math.random() * H; } while (Math.hypot(rx - x, ry - y) < 140); rocks.push(mk(rx, ry, 42)); } };
  field();
  const key = (e: KeyboardEvent, d: boolean) => { if (["ArrowLeft", "ArrowRight", "ArrowUp", "a", "d", "w", "A", "D", "W", " "].includes(e.key)) { e.preventDefault(); if (d) keys.add(e.key.toLowerCase()); else keys.delete(e.key.toLowerCase()); } };
  const kd = (e: KeyboardEvent) => key(e, true), ku = (e: KeyboardEvent) => key(e, false);
  window.addEventListener("keydown", kd); window.addEventListener("keyup", ku); canvas.focus();
  const wrap = (o: { x: number; y: number }) => { if (o.x < 0) o.x += W; if (o.x > W) o.x -= W; if (o.y < 0) o.y += H; if (o.y > H) o.y -= H; };
  const frame = (ts: number) => {
    if (!alive) return;
    const dt = Math.min(0.05, (ts - last) / 1000 || 0.016); last = ts;
    if (keys.has("arrowleft") || keys.has("a")) ang -= 4 * dt;
    if (keys.has("arrowright") || keys.has("d")) ang += 4 * dt;
    if (keys.has("arrowup") || keys.has("w")) { vx += Math.cos(ang) * 260 * dt; vy += Math.sin(ang) * 260 * dt; }
    vx *= 0.995; vy *= 0.995; x += vx * dt; y += vy * dt; wrap({ x, y }); if (x < 0) x += W; if (x > W) x -= W; if (y < 0) y += H; if (y > H) y -= H;
    cd -= dt; inv -= dt;
    if (keys.has(" ") && cd <= 0 && shots.length < 4) { shots.push({ x: x + Math.cos(ang) * 14, y: y + Math.sin(ang) * 14, vx: Math.cos(ang) * 420 + vx, vy: Math.sin(ang) * 420 + vy, t: 1.1 }); cd = 0.2; }
    shots = shots.filter((s) => { s.x += s.vx * dt; s.y += s.vy * dt; wrap(s); return (s.t -= dt) > 0; });
    for (const r of rocks) { r.x += r.vx * dt; r.y += r.vy * dt; r.a += r.va * dt; wrap(r); }
    const next: Rock[] = [];
    for (const r of rocks) {
      const hit = shots.find((s) => Math.hypot(s.x - r.x, s.y - r.y) < r.r);
      if (hit) { hit.t = 0; score += r.r > 30 ? 20 : r.r > 18 ? 50 : 100; onScore(score); if (r.r > 18) { next.push(mk(r.x, r.y, r.r / 2), mk(r.x, r.y, r.r / 2)); } }
      else next.push(r);
    }
    rocks = next;
    if (inv <= 0 && rocks.some((r) => Math.hypot(r.x - x, r.y - y) < r.r + 8)) { lives--; inv = 2.5; x = W / 2; y = H / 2; vx = vy = 0; if (lives <= 0) { alive = false; draw(); onEnd(score); return; } }
    if (rocks.length === 0) { level++; score += 300; onScore(score); field(); inv = 2; }
    draw(); raf = requestAnimationFrame(frame);
  };
  const draw = () => {
    ctx.fillStyle = "#070a16"; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "#94a3b8"; ctx.lineWidth = 1.5;
    for (const r of rocks) { ctx.beginPath(); r.pts.forEach((p, i) => { const a = r.a + (i / r.pts.length) * Math.PI * 2; const px = r.x + Math.cos(a) * r.r * p, py = r.y + Math.sin(a) * r.r * p; if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }); ctx.closePath(); ctx.stroke(); }
    ctx.fillStyle = "#fff"; for (const s of shots) ctx.fillRect(s.x - 1.5, s.y - 1.5, 3, 3);
    if (inv <= 0 || Math.floor(inv * 10) % 2 === 0) { ctx.strokeStyle = "#ffcf5c"; ctx.beginPath(); ctx.moveTo(x + Math.cos(ang) * 14, y + Math.sin(ang) * 14); ctx.lineTo(x + Math.cos(ang + 2.5) * 11, y + Math.sin(ang + 2.5) * 11); ctx.lineTo(x + Math.cos(ang - 2.5) * 11, y + Math.sin(ang - 2.5) * 11); ctx.closePath(); ctx.stroke(); }
    ctx.fillStyle = "#94a3b8"; ctx.font = "12px monospace"; ctx.textAlign = "right"; ctx.fillText(`field ${level}  ${"♥".repeat(Math.max(0, lives))}`, W - 10, 18); ctx.textAlign = "left";
  };
  raf = requestAnimationFrame(frame);
  return () => { alive = false; cancelAnimationFrame(raf); window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); };
};
