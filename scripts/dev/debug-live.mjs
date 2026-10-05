// Two visitors walk the floor at once; the second should see the first (shared live session).
import { chromium } from "playwright";
const out = "/tmp/claude-0/-home-user-corematrix/80df1d3b-37c9-5f70-bd13-ed1efde32587/scratchpad";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
const A = await (await b.newContext({ viewport: { width: 1100, height: 700 } })).newPage();
const B = await (await b.newContext({ viewport: { width: 1100, height: 700 } })).newPage();
for (const p of [A, B]) p.on("pageerror", (e) => console.log("pageerror", e.message));
await A.goto("http://localhost:3000/app?mode=walk&clean=1", { waitUntil: "load", timeout: 180000 });
await B.goto("http://localhost:3000/app?mode=walk&clean=1", { waitUntil: "load", timeout: 180000 });
await A.waitForTimeout(4000); await B.waitForTimeout(1000);
// A walks forward a bit, B turns around to look back... both start at the same spot, so B steps back and looks.
await A.keyboard.down("ArrowUp"); await A.waitForTimeout(2500); await A.keyboard.up("ArrowUp");
await B.keyboard.down("ArrowDown"); await B.waitForTimeout(800); await B.keyboard.up("ArrowDown");
await B.waitForTimeout(1500);
const roster = await B.evaluate(() => new Promise((res) => { const es = new EventSource("/api/live"); const t = setTimeout(() => { es.close(); res("timeout"); }, 5000); es.onmessage = (e) => { const m = JSON.parse(e.data); if (m.type === "players") { clearTimeout(t); es.close(); res(m.players.map((p) => `${p.n}@${p.x.toFixed(0)},${p.z.toFixed(0)} s${p.s}`)); } }; }));
console.log("roster seen by B:", roster);
console.log("name tags on B:", await B.locator("text=Visitor").count());
await B.screenshot({ path: `${out}/live-B.png` });
await A.screenshot({ path: `${out}/live-A.png` });
await b.close();
