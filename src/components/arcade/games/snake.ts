import type { GameRunner } from "../GameShell";

/** Serpent Ave: snake on a 32×24 grid. +10 per apple, speed ramps. */
export const runSnake: GameRunner = (canvas, onScore, onEnd) => {
  const ctx = canvas.getContext("2d")!;
  const W = 32, H = 24, S = canvas.width / W;
  const snake = [{ x: 8, y: 12 }, { x: 7, y: 12 }, { x: 6, y: 12 }];
  let dir = { x: 1, y: 0 }, next = dir;
  let apple = place();
  let score = 0, tick = 0, speed = 8, alive = true, raf = 0, last = 0;
  function place() {
    let p: { x: number; y: number };
    do p = { x: Math.floor(Math.random() * W), y: Math.floor(Math.random() * H) };
    while (snake.some((s) => s.x === p.x && s.y === p.y));
    return p;
  }
  const key = (e: KeyboardEvent) => {
    const m: Record<string, { x: number; y: number }> = { ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 }, ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, w: { x: 0, y: -1 }, s: { x: 0, y: 1 }, a: { x: -1, y: 0 }, d: { x: 1, y: 0 } };
    const n = m[e.key];
    if (!n) return;
    e.preventDefault();
    if (n.x === -dir.x && n.y === -dir.y) return;
    next = n;
  };
  window.addEventListener("keydown", key);
  canvas.focus();
  const step = () => {
    dir = next;
    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
    if (head.x < 0 || head.y < 0 || head.x >= W || head.y >= H || snake.some((s) => s.x === head.x && s.y === head.y)) {
      alive = false;
      return;
    }
    snake.unshift(head);
    if (head.x === apple.x && head.y === apple.y) {
      score += 10;
      onScore(score);
      apple = place();
      if (score % 50 === 0) speed = Math.min(18, speed + 1);
    } else snake.pop();
  };
  const draw = () => {
    ctx.fillStyle = "#070a16";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#101631";
    for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) if ((x + y) % 2) ctx.fillRect(x * S, y * S, S, S);
    ctx.fillStyle = "#ff6b6b";
    ctx.beginPath();
    ctx.arc(apple.x * S + S / 2, apple.y * S + S / 2, S * 0.38, 0, Math.PI * 2);
    ctx.fill();
    snake.forEach((s, i) => {
      ctx.fillStyle = i === 0 ? "#ffcf5c" : `hsl(${160 + i * 2}, 70%, ${55 - Math.min(25, i)}%)`;
      ctx.fillRect(s.x * S + 1, s.y * S + 1, S - 2, S - 2);
    });
  };
  const loop = (t: number) => {
    if (!alive) {
      draw();
      ctx.fillStyle = "rgba(0,0,0,.5)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      window.removeEventListener("keydown", key);
      onEnd(score);
      return;
    }
    if (t - last > 1000 / speed) {
      last = t;
      tick++;
      step();
    }
    draw();
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
  void tick;
  return () => {
    alive = false;
    cancelAnimationFrame(raf);
    window.removeEventListener("keydown", key);
  };
};
