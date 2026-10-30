import type { GameRunner } from "../GameShell";

/** Longbox Stack: falling tetrominoes. Arrows move, up rotates, down drops faster, space hard-drops. 100/300/500/800 per 1-4 lines. */
export const runStack: GameRunner = (canvas, onScore, onEnd) => {
  const ctx = canvas.getContext("2d")!;
  const COLS = 10, ROWS = 20, S = Math.floor(canvas.height / ROWS), OX = Math.floor((canvas.width - COLS * S) / 2);
  const SHAPES = [[[1, 1, 1, 1]], [[1, 1], [1, 1]], [[0, 1, 0], [1, 1, 1]], [[1, 0, 0], [1, 1, 1]], [[0, 0, 1], [1, 1, 1]], [[0, 1, 1], [1, 1, 0]], [[1, 1, 0], [0, 1, 1]]];
  const COLORS = ["#5ee6c3", "#ffcf5c", "#9b5de5", "#5b8def", "#ff8a5c", "#5ee67a", "#ff5c8a"];
  const grid: number[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(-1));
  let cur = spawn(), score = 0, lines = 0, alive = true, raf = 0, last = 0, drop = 0, speed = 0.8;
  function spawn() { const k = Math.floor(Math.random() * SHAPES.length); return { k, m: SHAPES[k].map((r) => [...r]), x: 3, y: 0 }; }
  const fits = (m: number[][], x: number, y: number) => m.every((row, j) => row.every((v, i) => !v || (y + j >= 0 && y + j < ROWS && x + i >= 0 && x + i < COLS && grid[y + j][x + i] === -1)));
  const rot = (m: number[][]) => m[0].map((_, i) => m.map((r) => r[i]).reverse());
  const lock = () => {
    cur.m.forEach((row, j) => row.forEach((v, i) => { if (v) grid[cur.y + j][cur.x + i] = cur.k; }));
    let n = 0; for (let r = ROWS - 1; r >= 0; r--) if (grid[r].every((c) => c !== -1)) { grid.splice(r, 1); grid.unshift(Array(COLS).fill(-1)); n++; r++; }
    if (n) { lines += n; score += [0, 100, 300, 500, 800][n] * (1 + Math.floor(lines / 10) * 0.5); score = Math.floor(score); speed = Math.max(0.12, 0.8 - Math.floor(lines / 10) * 0.08); onScore(score); }
    cur = spawn(); if (!fits(cur.m, cur.x, cur.y)) { alive = false; draw(); onEnd(score); }
  };
  const kd = (e: KeyboardEvent) => {
    if (!alive) return;
    const k = (e.key || "").toLowerCase();
    if (["arrowleft", "a"].includes(k) && fits(cur.m, cur.x - 1, cur.y)) cur.x--;
    else if (["arrowright", "d"].includes(k) && fits(cur.m, cur.x + 1, cur.y)) cur.x++;
    else if (["arrowup", "w"].includes(k)) { const r = rot(cur.m); if (fits(r, cur.x, cur.y)) cur.m = r; else if (fits(r, cur.x - 1, cur.y)) { cur.m = r; cur.x--; } else if (fits(r, cur.x + 1, cur.y)) { cur.m = r; cur.x++; } }
    else if (["arrowdown", "s"].includes(k)) { if (fits(cur.m, cur.x, cur.y + 1)) { cur.y++; score += 1; onScore(score); } }
    else if (k === " ") { while (fits(cur.m, cur.x, cur.y + 1)) { cur.y++; score += 2; } onScore(score); lock(); }
    else return;
    e.preventDefault();
  };
  window.addEventListener("keydown", kd); canvas.focus();
  const frame = (ts: number) => {
    if (!alive) return;
    const dt = Math.min(0.05, (ts - last) / 1000 || 0.016); last = ts;
    drop += dt; if (drop >= speed) { drop = 0; if (fits(cur.m, cur.x, cur.y + 1)) cur.y++; else lock(); }
    draw(); if (alive) raf = requestAnimationFrame(frame);
  };
  const cell = (x: number, y: number, k: number) => { ctx.fillStyle = COLORS[k]; ctx.fillRect(OX + x * S + 1, y * S + 1, S - 2, S - 2); };
  const draw = () => {
    ctx.fillStyle = "#070a16"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#0f1526"; ctx.fillRect(OX, 0, COLS * S, ROWS * S);
    grid.forEach((row, y) => row.forEach((k, x) => { if (k !== -1) cell(x, y, k); }));
    if (alive) cur.m.forEach((row, j) => row.forEach((v, i) => { if (v) cell(cur.x + i, cur.y + j, cur.k); }));
    ctx.fillStyle = "#94a3b8"; ctx.font = "12px monospace"; ctx.fillText(`lines ${lines}`, OX + COLS * S + 12, 20);
  };
  raf = requestAnimationFrame(frame);
  return () => { alive = false; cancelAnimationFrame(raf); window.removeEventListener("keydown", kd); };
};
