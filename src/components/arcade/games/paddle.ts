import type { GameRunner } from "../GameShell";

/** Paddle Duel: pong against the house. +10 per return, +100 per point won; the game ends when the house takes 5. */
export const runPaddle: GameRunner = (canvas, onScore, onEnd) => {
  const ctx = canvas.getContext("2d")!;
  const W = canvas.width, H = canvas.height, PH = 70;
  let py = H / 2, ay = H / 2, bx = W / 2, by = H / 2, bvx = 260, bvy = 120, score = 0, lost = 0, won = 0, alive = true, raf = 0, last = 0, target: number | null = null;
  const keys = new Set<string>();
  const kd = (e: KeyboardEvent) => { if (["ArrowUp", "ArrowDown", "w", "s", "W", "S"].includes(e.key)) { e.preventDefault(); keys.add(e.key.toLowerCase()); } };
  const ku = (e: KeyboardEvent) => keys.delete(e.key.toLowerCase());
  const pm = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); target = ((e.clientY - r.top) / r.height) * H; };
  window.addEventListener("keydown", kd); window.addEventListener("keyup", ku); canvas.addEventListener("pointermove", pm); canvas.focus();
  const serve = (toRight: boolean) => { bx = W / 2; by = H / 2; bvx = (toRight ? 1 : -1) * (240 + won * 12); bvy = (Math.random() - 0.5) * 240; };
  const frame = (ts: number) => {
    if (!alive) return;
    const dt = Math.min(0.05, (ts - last) / 1000 || 0.016); last = ts;
    if (target !== null) py += (target - py) * Math.min(1, dt * 14); else py += ((keys.has("arrowdown") || keys.has("s") ? 1 : 0) - (keys.has("arrowup") || keys.has("w") ? 1 : 0)) * 380 * dt;
    py = Math.max(PH / 2, Math.min(H - PH / 2, py));
    const aiSpeed = 200 + won * 14; ay += Math.max(-aiSpeed * dt, Math.min(aiSpeed * dt, (bvx > 0 ? by : H / 2) - ay));
    bx += bvx * dt; by += bvy * dt;
    if (by < 6 || by > H - 6) { bvy = -bvy; by = Math.max(6, Math.min(H - 6, by)); }
    if (bx < 24 && bvx < 0 && Math.abs(by - py) < PH / 2 + 6) { bvx = -bvx * 1.04; bvy += (by - py) * 4; bx = 24; score += 10; onScore(score); }
    if (bx > W - 24 && bvx > 0 && Math.abs(by - ay) < PH / 2 + 6) { bvx = -bvx; bvy += (by - ay) * 3; bx = W - 24; }
    if (bx < -10) { lost++; if (lost >= 5) { alive = false; draw(); onEnd(score); return; } serve(false); }
    if (bx > W + 10) { won++; score += 100; onScore(score); serve(true); }
    draw(); raf = requestAnimationFrame(frame);
  };
  const draw = () => {
    ctx.fillStyle = "#070a16"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#1e293b"; for (let yy = 0; yy < H; yy += 24) ctx.fillRect(W / 2 - 1, yy, 2, 12);
    ctx.fillStyle = "#ffcf5c"; ctx.fillRect(12, py - PH / 2, 8, PH);
    ctx.fillStyle = "#5ee6c3"; ctx.fillRect(W - 20, ay - PH / 2, 8, PH);
    ctx.fillStyle = "#fff"; ctx.fillRect(bx - 5, by - 5, 10, 10);
    ctx.fillStyle = "#94a3b8"; ctx.font = "14px monospace"; ctx.textAlign = "center"; ctx.fillText(`${won}   ${lost}`, W / 2, 24); ctx.textAlign = "left";
  };
  serve(true); raf = requestAnimationFrame(frame);
  return () => { alive = false; cancelAnimationFrame(raf); window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); canvas.removeEventListener("pointermove", pm); };
};
