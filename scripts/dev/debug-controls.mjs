// Drives walk mode with the keyboard and a mouse drag, screenshots the result.
import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs = [];
p.on("pageerror", (e) => errs.push(String(e.message)));
await p.goto("http://localhost:3000/app?mode=walk&clean=1", { waitUntil: "load", timeout: 180000 });
await p.waitForTimeout(4000);
await p.screenshot({ path: "/tmp/claude-0/-home-user-corematrix/80df1d3b-37c9-5f70-bd13-ed1efde32587/scratchpad/ctl-0.png" });
await p.keyboard.down("ArrowUp"); await p.waitForTimeout(1500); await p.keyboard.up("ArrowUp");
await p.keyboard.down("ArrowRight"); await p.waitForTimeout(600); await p.keyboard.up("ArrowRight");
await p.waitForTimeout(500);
await p.screenshot({ path: "/tmp/claude-0/-home-user-corematrix/80df1d3b-37c9-5f70-bd13-ed1efde32587/scratchpad/ctl-1.png" });
await p.mouse.move(640, 400); await p.mouse.down(); for (let i = 1; i <= 20; i++) { await p.mouse.move(640 - i * 15, 400 - i * 3); await p.waitForTimeout(30); } await p.mouse.up();
await p.waitForTimeout(600);
await p.screenshot({ path: "/tmp/claude-0/-home-user-corematrix/80df1d3b-37c9-5f70-bd13-ed1efde32587/scratchpad/ctl-2.png" });
console.log("errors:", errs);
await b.close();
