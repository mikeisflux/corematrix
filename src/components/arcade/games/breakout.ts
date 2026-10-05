import type { GameRunner } from "../GameShell";

/** Block Party: breakout where the bricks are stacked longboxes. +10 per brick, +50 per cleared level, 3 balls. */
export const runBreakout: GameRunner = (canvas, onScore, onEnd) => {
  const ctx = canvas.getContext("2d")!;
  const W = canvas.width, H = canvas.height;
  const paddle = { x: W / 2 - 50, w: 100, h: 12 };
  let ball = { x: W / 2, y: H - 60, vx: 3, vy: -4, r: 6 };
  let bricks: Array<{ x: number; y: number; w: number; h: number; c: string; hp: number }> = [];
  let score = 0, lives = 3, level = 1, alive = true, raf = 0;
  const build = () => {
    bricks = [];
    const cols = 12, bw = W / cols;
    for (let c = 0; c < cols; c++) {
      const floors = 2 + Math.floor(Math.random() * (3 + level));
      const col = `hsl(${(c * 37) % 360}, 70%, 55%)`;
      for (let f = 0; f < floors; f++) bricks.push({ x: c * bw + 2, y: 60 + (8 - f) * 18, w: bw - 4, h: 16, c: col, hp: f === floors - 1 ? 2 : 1 });
    }
  };
  build();
  const move = (e: MouseEvent | TouchEvent) => {
    const r = canvas.getBoundingClientRect();
    const cx = "touches" in e ? e.touches[0].clientX : e.clientX;
    paddle.x = Math.max(0, Math.min(W - paddle.w, ((cx - r.left) / r.width) * W - paddle.w / 2));
  };
  const keys: Record<string, boolean> = {};
  const kd = (e: KeyboardEvent) => { keys[e.key] = true; if (e.key.startsWith("Arrow")) e.preventDefault(); };
  const ku = (e: KeyboardEvent) => { keys[e.key] = false; };
  canvas.addEventListener("mousemove", move);
  canvas.addEventListener("touchmove", move, { passive: true });
  window.addEventListener("keydown", kd);
  window.addEventListener("keyup", ku);
  const reset = () => { ball = { x: W / 2, y: H - 60, vx: 3 * (Math.random() > 0.5 ? 1 : -1), vy: -4 - level * 0.4, r: 6 }; };
  const loop = () => {
    if (!alive) return;
    if (keys.ArrowLeft || keys.a) paddle.x = Math.max(0, paddle.x - 7);
    if (keys.ArrowRight || keys.d) paddle.x = Math.min(W - paddle.w, paddle.x + 7);
    ball.x += ball.vx;
    ball.y += ball.vy;
    if (ball.x < ball.r || ball.x > W - ball.r) ball.vx *= -1;
    if (ball.y < ball.r) ball.vy *= -1;
    if (ball.y > H + 20) {
      lives--;
      if (lives <= 0) { alive = false; cleanup(); onEnd(score); return; }
      reset();
    }
    if (ball.vy > 0 && ball.y + ball.r >= H - 30 && ball.y + ball.r <= H - 30 + paddle.h + 6 && ball.x >= paddle.x && ball.x <= paddle.x + paddle.w) {
      const rel = (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2);
      const sp = Math.min(9, Math.hypot(ball.vx, ball.vy) + 0.15);
      ball.vx = rel * sp * 0.9;
      ball.vy = -Math.sqrt(Math.max(4, sp * sp - ball.vx * ball.vx));
    }
    for (const b of bricks) {
      if (b.hp > 0 && ball.x > b.x - ball.r && ball.x < b.x + b.w + ball.r && ball.y > b.y - ball.r && ball.y < b.y + b.h + ball.r) {
        b.hp--;
        const fromSide = ball.x < b.x || ball.x > b.x + b.w;
        if (fromSide) ball.vx *= -1; else ball.vy *= -1;
        if (b.hp === 0) { score += 10; onScore(score); }
        break;
      }
    }
    if (bricks.every((b) => b.hp === 0)) { level++; score += 50; onScore(score); build(); reset(); }
    ctx.fillStyle = "#070a16";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#121a3a";
    ctx.fillRect(0, H - 14, W, 14);
    for (const b of bricks) {
      if (b.hp <= 0) continue;
      ctx.fillStyle = b.c;
      ctx.globalAlpha = b.hp === 2 ? 1 : 0.85;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "rgba(255,255,255,.25)";
      for (let wx = b.x + 4; wx < b.x + b.w - 4; wx += 8) ctx.fillRect(wx, b.y + 4, 4, 6);
    }
    ctx.fillStyle = "#ffcf5c";
    ctx.fillRect(paddle.x, H - 30, paddle.w, paddle.h);
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#9aa4c7";
    ctx.font = "12px ui-monospace, monospace";
    ctx.fillText(`balls ${lives} · level ${level}`, W - 130, 20);
    raf = requestAnimationFrame(loop);
  };
  const cleanup = () => {
    cancelAnimationFrame(raf);
    canvas.removeEventListener("mousemove", move);
    canvas.removeEventListener("touchmove", move);
    window.removeEventListener("keydown", kd);
    window.removeEventListener("keyup", ku);
  };
  raf = requestAnimationFrame(loop);
  return () => { alive = false; cleanup(); };
};
