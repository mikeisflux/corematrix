import type { GameRunner } from "../GameShell";

/** Cover Match: 16 cards, 8 pairs of cover icons, against the clock. +100 a pair, a time bonus at the end, -2 a miss. */
export const runMatch: GameRunner = (canvas, onScore, onEnd) => {
  const ctx = canvas.getContext("2d")!;
  const W = canvas.width, H = canvas.height, COLS = 4, ROWS = 4, CW = 110, CH = 90, OX = (W - COLS * CW) / 2, OY = (H - ROWS * CH) / 2 + 10;
  const ICONS = ["⚡", "🦇", "🛡️", "💥", "🕷️", "👑", "🔥", "🌙"];
  const deck = [...ICONS, ...ICONS].sort(() => Math.random() - 0.5).map((icon) => ({ icon, up: false, done: false }));
  let open: number[] = [], score = 0, left = 60, alive = true, raf = 0, last = 0, lockUntil = 0, pairs = 0;
  const flip = (i: number) => {
    const c = deck[i]; if (!alive || c.done || c.up || open.length >= 2 || performance.now() < lockUntil) return;
    c.up = true; open.push(i);
    if (open.length === 2) {
      const [a, b] = open;
      if (deck[a].icon === deck[b].icon) { deck[a].done = deck[b].done = true; open = []; pairs++; score += 100; onScore(score); if (pairs === ICONS.length) { score += Math.floor(left) * 10; onScore(score); alive = false; draw(); onEnd(score); } }
      else { score = Math.max(0, score - 2); onScore(score); lockUntil = performance.now() + 650; setTimeout(() => { deck[a].up = deck[b].up = false; open = []; }, 650); }
    }
  };
  const pd = (e: PointerEvent) => { const r = canvas.getBoundingClientRect(); const x = ((e.clientX - r.left) / r.width) * W - OX, y = ((e.clientY - r.top) / r.height) * H - OY; const cx = Math.floor(x / CW), cy = Math.floor(y / CH); if (cx >= 0 && cx < COLS && cy >= 0 && cy < ROWS) flip(cy * COLS + cx); };
  canvas.addEventListener("pointerdown", pd); canvas.focus();
  const frame = (ts: number) => {
    if (!alive) return;
    const dt = Math.min(0.05, (ts - last) / 1000 || 0.016); last = ts; left -= dt;
    if (left <= 0) { alive = false; draw(); onEnd(score); return; }
    draw(); raf = requestAnimationFrame(frame);
  };
  const draw = () => {
    ctx.fillStyle = "#070a16"; ctx.fillRect(0, 0, W, H);
    deck.forEach((c, i) => {
      const x = OX + (i % COLS) * CW + 6, y = OY + Math.floor(i / COLS) * CH + 6;
      ctx.fillStyle = c.done ? "#14532d" : c.up ? "#f8fafc" : "#1e293b"; ctx.fillRect(x, y, CW - 12, CH - 12);
      if (c.up || c.done) { ctx.font = "34px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(c.icon, x + (CW - 12) / 2, y + (CH - 12) / 2); ctx.textBaseline = "alphabetic"; ctx.textAlign = "left"; }
      else { ctx.fillStyle = "#334155"; ctx.fillRect(x + 10, y + 10, CW - 32, CH - 32); }
    });
    ctx.fillStyle = "#94a3b8"; ctx.font = "12px monospace"; ctx.textAlign = "right"; ctx.fillText(`${Math.ceil(Math.max(0, left))} s · ${pairs}/${ICONS.length} pairs`, W - 10, 18); ctx.textAlign = "left";
  };
  raf = requestAnimationFrame(frame);
  return () => { alive = false; cancelAnimationFrame(raf); canvas.removeEventListener("pointerdown", pd); };
};
