import type { GameRunner } from "../GameShell";

/** Cape Flap: tap, click or space to flap through the gaps. +10 per gap. */
export const runFlap: GameRunner = (canvas, onScore, onEnd) => {
  const ctx = canvas.getContext("2d")!;
  const W = canvas.width, H = canvas.height;
  let y = H / 2, vy = 0, score = 0, alive = true, raf = 0, last = 0, t = 0;
  let pipes: { x: number; gap: number; passed: boolean }[] = [{ x: W + 100, gap: H / 2, passed: false }];
  const flap = () => { vy = -300; };
  const kd = (e: KeyboardEvent) => { if (e.key === " " || e.key === "ArrowUp" || e.key.toLowerCase() === "w") { e.preventDefault(); flap(); } };
  window.addEventListener("keydown", kd); canvas.addEventListener("pointerdown", flap); canvas.focus();
  const frame = (ts: number) => {
    if (!alive) return;
    const dt = Math.min(0.05, (ts - last) / 1000 || 0.016); last = ts; t += dt;
    vy += 900 * dt; y += vy * dt;
    const speed = 170 + score * 0.6;
    for (const p of pipes) { p.x -= speed * dt; if (!p.passed && p.x < 90) { p.passed = true; score += 10; onScore(score); } }
    if (pipes[pipes.length - 1].x < W - 230) pipes.push({ x: W + 40, gap: 90 + Math.random() * (H - 180), passed: false });
    pipes = pipes.filter((p) => p.x > -60);
    const GAP = Math.max(120, 170 - score * 0.3);
    if (y > H - 10 || y < -20 || pipes.some((p) => Math.abs(p.x - 100) < 34 && Math.abs(y - p.gap) > GAP / 2 - 12)) { alive = false; draw(GAP); onEnd(score); return; }
    draw(GAP); raf = requestAnimationFrame(frame);
  };
  const draw = (GAP: number) => {
    ctx.fillStyle = "#0b1230"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#1e293b"; for (let i = 0; i < 8; i++) ctx.fillRect(((i * 97 - t * 20) % (W + 80) + W + 80) % (W + 80) - 40, 60 + (i % 3) * 110, 60, 30);
    ctx.fillStyle = "#5ee6c3"; for (const p of pipes) { ctx.fillRect(p.x - 22, 0, 44, p.gap - GAP / 2); ctx.fillRect(p.x - 22, p.gap + GAP / 2, 44, H); }
    ctx.save(); ctx.translate(100, y); ctx.rotate(Math.max(-0.5, Math.min(0.8, vy / 600)));
    ctx.fillStyle = "#ff5c8a"; ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(-30, -10); ctx.lineTo(-24, 8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#ffcf5c"; ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#070a16"; ctx.fillRect(2, -4, 5, 4); ctx.restore();
  };
  raf = requestAnimationFrame(frame);
  return () => { alive = false; cancelAnimationFrame(raf); window.removeEventListener("keydown", kd); canvas.removeEventListener("pointerdown", flap); };
};
