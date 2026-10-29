import type { GameRunner } from "../GameShell";

/** Whack-a-Villain: 45 seconds, villains pop out of 9 hatches. Click/tap or keys 1-9. +10 a villain, -5 for whacking a fan, they get faster. */
export const runWhack: GameRunner = (canvas, onScore, onEnd) => {
  const ctx = canvas.getContext("2d")!;
  const W = canvas.width, H = canvas.height, N = 9, CX = (i: number) => W / 2 + ((i % 3) - 1) * 170, CY = (i: number) => H / 2 + (Math.floor(i / 3) - 1) * 130;
  type Hole = { kind: 0 | 1 | 2; t: number; hit: boolean }; // 0 empty, 1 villain, 2 fan
  const holes: Hole[] = Array.from({ length: N }, () => ({ kind: 0, t: 0, hit: false }));
  let score = 0, left = 45, alive = true, raf = 0, last = 0, pops: { x: number; y: number; txt: string; t: number }[] = [];
  const whack = (i: number) => {
    const h = holes[i]; if (!alive || h.kind === 0 || h.hit) return;
    h.hit = true; if (h.kind === 1) { score += 10; pops.push({ x: CX(i), y: CY(i), txt: "+10", t: 0.6 }); } else { score = Math.max(0, score - 5); pops.push({ x: CX(i), y: CY(i), txt: "-5", t: 0.6 }); }
    onScore(score);
  };
  const pd = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); const x = ((e.clientX - r.left) / r.width) * W, y = ((e.clientY - r.top) / r.height) * H; for (let i = 0; i < N; i++) if (Math.hypot(x - CX(i), y - CY(i)) < 55) whack(i); };
  const kd = (e: KeyboardEvent) => { const n = Number(e.key); if (n >= 1 && n <= 9) { e.preventDefault(); whack(n - 1); } };
  canvas.addEventListener("pointerdown", pd); window.addEventListener("keydown", kd); canvas.focus();
  const frame = (ts: number) => {
    if (!alive) return;
    const dt = Math.min(0.05, (ts - last) / 1000 || 0.016); last = ts; left -= dt;
    const pace = 1 + (45 - left) / 25;
    for (const h of holes) { if (h.kind) { h.t -= dt * pace; if (h.t <= 0) { h.kind = 0; h.hit = false; } } else if (Math.random() < dt * 0.6 * pace) { h.kind = Math.random() < 0.75 ? 1 : 2; h.t = 1.2; h.hit = false; } }
    pops = pops.filter((p) => { p.y -= 40 * dt; return (p.t -= dt) > 0; });
    if (left <= 0) { alive = false; draw(); onEnd(score); return; }
    draw(); raf = requestAnimationFrame(frame);
  };
  const draw = () => {
    ctx.fillStyle = "#070a16"; ctx.fillRect(0, 0, W, H);
    holes.forEach((h, i) => {
      ctx.fillStyle = "#1e293b"; ctx.beginPath(); ctx.ellipse(CX(i), CY(i) + 30, 50, 18, 0, 0, Math.PI * 2); ctx.fill();
      if (h.kind && !h.hit) { const up = Math.min(1, h.t * 3); ctx.fillStyle = h.kind === 1 ? "#9b5de5" : "#5ee6c3"; ctx.beginPath(); ctx.arc(CX(i), CY(i) + 30 - 40 * up, 26, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#070a16"; ctx.fillRect(CX(i) - 12, CY(i) + 22 - 40 * up, 8, 5); ctx.fillRect(CX(i) + 4, CY(i) + 22 - 40 * up, 8, 5); if (h.kind === 1) { ctx.fillRect(CX(i) - 14, CY(i) + 14 - 40 * up, 28, 4); } }
      else if (h.hit) { ctx.fillStyle = "#ffcf5c"; ctx.font = "26px sans-serif"; ctx.textAlign = "center"; ctx.fillText("💥", CX(i), CY(i) + 10); ctx.textAlign = "left"; }
      ctx.fillStyle = "#475569"; ctx.font = "11px monospace"; ctx.fillText(String(i + 1), CX(i) - 54, CY(i) + 44);
    });
    ctx.fillStyle = "#fff"; ctx.font = "bold 14px monospace"; ctx.textAlign = "center"; for (const p of pops) ctx.fillText(p.txt, p.x, p.y);
    ctx.fillStyle = "#94a3b8"; ctx.font = "12px monospace"; ctx.textAlign = "right"; ctx.fillText(`${Math.ceil(Math.max(0, left))} s  · purple villains, teal fans`, W - 10, 18); ctx.textAlign = "left";
  };
  raf = requestAnimationFrame(frame);
  return () => { alive = false; cancelAnimationFrame(raf); canvas.removeEventListener("pointerdown", pd); window.removeEventListener("keydown", kd); };
};
