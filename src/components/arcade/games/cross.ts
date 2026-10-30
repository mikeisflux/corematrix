import type { GameRunner } from "../GameShell";

/** Aisle Crosser: hop across lanes of hand carts and crowds to the far side. Arrows/WASD. +5 a step forward, +100 a crossing, 3 lives. */
export const runCross: GameRunner = (canvas, onScore, onEnd) => {
  const ctx = canvas.getContext("2d")!;
  const W = canvas.width, H = canvas.height, LANES = 9, LH = H / (LANES + 2), CW = 40;
  type Cart = { x: number; w: number; v: number; c: string };
  let px = W / 2, lane = 0, score = 0, lives = 3, best = 0, crossings = 0, alive = true, raf = 0, last = 0, inv = 0;
  const lanes: Cart[][] = [];
  const build = () => { lanes.length = 0; for (let i = 0; i < LANES; i++) { const dir = i % 2 ? 1 : -1, v = (60 + Math.random() * 60 + crossings * 12) * dir, n = 2 + Math.floor(Math.random() * 2); const row: Cart[] = []; for (let k = 0; k < n; k++) row.push({ x: (k / n) * W + Math.random() * 60, w: 50 + Math.random() * 50, v, c: ["#ffcf5c", "#5ee6c3", "#ff5c8a", "#5b8def"][i % 4] }); lanes.push(row); } };
  build();
  const laneY = (l: number) => H - LH * (l + 1.5);
  const kd = (e: KeyboardEvent) => {
    const k = (e.key || "").toLowerCase(); let moved = false;
    if (["arrowup", "w"].includes(k)) { lane++; moved = true; if (lane > best) { best = lane; score += 5; } }
    else if (["arrowdown", "s"].includes(k) && lane > 0) { lane--; moved = true; }
    else if (["arrowleft", "a"].includes(k)) { px = Math.max(20, px - CW); moved = true; }
    else if (["arrowright", "d"].includes(k)) { px = Math.min(W - 20, px + CW); moved = true; }
    if (!moved) return; e.preventDefault();
    if (lane > LANES) { crossings++; score += 100; lane = 0; best = 0; px = W / 2; build(); }
    onScore(score);
  };
  const tap = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); const x = ((e.clientX - r.left) / r.width) * W, y = ((e.clientY - r.top) / r.height) * H; const dx = x - px, dy = y - laneY(lane); kd(new KeyboardEvent("keydown", { key: Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "ArrowRight" : "ArrowLeft") : dy < 0 ? "ArrowUp" : "ArrowDown" })); };
  window.addEventListener("keydown", kd); canvas.addEventListener("pointerdown", tap); canvas.focus();
  const frame = (ts: number) => {
    if (!alive) return;
    const dt = Math.min(0.05, (ts - last) / 1000 || 0.016); last = ts; inv -= dt;
    for (const row of lanes) for (const c of row) { c.x += c.v * dt; if (c.v > 0 && c.x > W + 20) c.x = -c.w - 20; if (c.v < 0 && c.x + c.w < -20) c.x = W + 20; }
    if (inv <= 0 && lane >= 1 && lane <= LANES) { const row = lanes[lane - 1]; if (row.some((c) => px + 12 > c.x && px - 12 < c.x + c.w)) { lives--; inv = 1.5; lane = 0; px = W / 2; if (lives <= 0) { alive = false; draw(); onEnd(score); return; } } }
    draw(); raf = requestAnimationFrame(frame);
  };
  const draw = () => {
    ctx.fillStyle = "#070a16"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#1a2340"; ctx.fillRect(0, H - LH, W, LH); ctx.fillRect(0, 0, W, LH);
    ctx.fillStyle = "#0f1526"; for (let i = 0; i < LANES; i++) ctx.fillRect(0, laneY(i + 1) - LH / 2, W, LH - 2);
    lanes.forEach((row, i) => { for (const c of row) { ctx.fillStyle = c.c; ctx.fillRect(c.x, laneY(i + 1) - LH * 0.3, c.w, LH * 0.6); } });
    if (inv <= 0 || Math.floor(inv * 10) % 2 === 0) { ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(px, laneY(lane), 11, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = "#ff5c8a"; ctx.fillRect(px - 5, laneY(lane) - 3, 10, 6); }
    ctx.fillStyle = "#94a3b8"; ctx.font = "12px monospace"; ctx.textAlign = "right"; ctx.fillText(`crossings ${crossings}  ${"♥".repeat(Math.max(0, lives))}`, W - 10, 18); ctx.textAlign = "left";
  };
  raf = requestAnimationFrame(frame);
  return () => { alive = false; cancelAnimationFrame(raf); window.removeEventListener("keydown", kd); canvas.removeEventListener("pointerdown", tap); };
};
