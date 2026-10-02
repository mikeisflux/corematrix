import type { GameRunner } from "../GameShell";

/** Rooftop Run: one-button endless runner across the skyline. Score = distance + coins. */
export const runRunner: GameRunner = (canvas, onScore, onEnd) => {
  const ctx = canvas.getContext("2d")!;
  const W = canvas.width, H = canvas.height, G = 0.6;
  let x = 0, speed = 4.5, score = 0, alive = true, raf = 0;
  const player = { y: 0, vy: 0, w: 22, h: 30, onGround: false, jumps: 0 };
  type Roof = { x: number; w: number; top: number; c: string; coin?: { x: number; y: number; taken: boolean } };
  const roofs: Roof[] = [];
  let lastEnd = 0;
  const addRoof = () => {
    const gap = roofs.length ? 40 + Math.random() * (60 + Math.min(80, speed * 8)) : 0;
    const w = 120 + Math.random() * 180;
    const top = H - 90 - Math.random() * 120;
    const r: Roof = { x: lastEnd + gap, w, top, c: `hsl(${Math.random() * 360}, 55%, 45%)` };
    if (Math.random() < 0.6) r.coin = { x: r.x + w / 2, y: top - 60 - Math.random() * 40, taken: false };
    roofs.push(r);
    lastEnd = r.x + w;
  };
  for (let i = 0; i < 6; i++) addRoof();
  player.y = roofs[0].top - player.h;
  const jump = (e?: Event) => {
    e?.preventDefault?.();
    if (player.onGround || player.jumps < 2) {
      player.vy = -11;
      player.onGround = false;
      player.jumps++;
    }
  };
  const key = (e: KeyboardEvent) => { if (e.code === "Space" || e.key === "ArrowUp" || e.key === "w") jump(e); };
  window.addEventListener("keydown", key);
  canvas.addEventListener("mousedown", jump);
  canvas.addEventListener("touchstart", jump, { passive: false });
  const px = 120;
  const loop = () => {
    if (!alive) return;
    x += speed;
    speed += 0.0015;
    score = Math.floor(x / 10) + Math.floor(score - Math.floor((x - speed) / 10));
    player.vy += G;
    player.y += player.vy;
    player.onGround = false;
    const wx = x + px;
    for (const r of roofs) {
      if (wx + player.w > r.x && wx < r.x + r.w) {
        if (player.vy >= 0 && player.y + player.h >= r.top && player.y + player.h - player.vy <= r.top + 2) {
          player.y = r.top - player.h;
          player.vy = 0;
          player.onGround = true;
          player.jumps = 0;
        }
      }
      if (r.coin && !r.coin.taken && Math.abs(r.coin.x - (wx + player.w / 2)) < 18 && Math.abs(r.coin.y - (player.y + player.h / 2)) < 24) {
        r.coin.taken = true;
        score += 25;
      }
    }
    onScore(score);
    if (player.y > H) { alive = false; cleanup(); onEnd(score); return; }
    while (roofs[0].x + roofs[0].w < x - 50) roofs.shift();
    while (lastEnd < x + W + 200) addRoof();
    ctx.fillStyle = "#070a16";
    ctx.fillRect(0, 0, W, H);
    // parallax skyline
    ctx.fillStyle = "#0f1530";
    for (let i = 0; i < 14; i++) {
      const bx = ((i * 97 - x * 0.3) % (W + 120)) - 60;
      ctx.fillRect(bx, H - 200 - (i % 4) * 40, 50, 300);
    }
    for (const r of roofs) {
      const sx = r.x - x;
      ctx.fillStyle = r.c;
      ctx.fillRect(sx, r.top, r.w, H - r.top);
      ctx.fillStyle = "rgba(255,255,255,.18)";
      for (let wy = r.top + 14; wy < H; wy += 20) for (let wxx = sx + 10; wxx < sx + r.w - 10; wxx += 18) ctx.fillRect(wxx, wy, 8, 10);
      if (r.coin && !r.coin.taken) {
        ctx.fillStyle = "#ffcf5c";
        ctx.beginPath();
        ctx.arc(r.coin.x - x, r.coin.y, 8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.fillStyle = "#5ee6c3";
    ctx.fillRect(px, player.y, player.w, player.h);
    ctx.fillStyle = "#070a16";
    ctx.fillRect(px + 13, player.y + 7, 5, 5);
    raf = requestAnimationFrame(loop);
  };
  const cleanup = () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("keydown", key);
    canvas.removeEventListener("mousedown", jump);
    canvas.removeEventListener("touchstart", jump);
  };
  raf = requestAnimationFrame(loop);
  return () => { alive = false; cleanup(); };
};
