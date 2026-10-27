// Island-only art: the superadmin uploads a tower wrap and a floor graphic on the house booth through the dashboard; then we look at the island.
import { chromium } from "playwright";
const out = "/tmp/claude-0/-home-user-corematrix/80df1d3b-37c9-5f70-bd13-ed1efde32587/scratchpad";
const base = "http://localhost:3000";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 } });
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("pageerror", e.message.slice(0, 200)));
const art = await ctx.newPage();
await art.setContent(`<body style="margin:0;width:800px;height:2800px;background:linear-gradient(#ff2bd6,#0b0f1a 40%,#0b0f1a 60%,#00f5ff);color:#ffd166;font:900 150px Arial;display:grid;place-items:center;text-align:center"><div>DIVINITY<br/>COMICS<br/>TOWER<br/>WRAP</div></body>`);
await art.screenshot({ path: `${out}/art-tower.png`, fullPage: true });
await art.setContent(`<body style="margin:0;width:2000px;height:2000px;background:repeating-conic-gradient(#ffd166 0 25%,#0b0f1a 0 50%) 50%/400px 400px;display:grid;place-items:center"><div style="width:1500px;height:1500px;border-radius:50%;background:#ff2bd6;display:grid;place-items:center;color:#fff;font:900 300px Arial">FLOOR</div></body>`);
await art.screenshot({ path: `${out}/art-floor.png`, fullPage: true });
await art.close();
let r = await p.request.post(`${base}/api/auth/password`, { data: { email: "divinitycomicsinc@gmail.com", password: "DFLKji4i9ksl" } }); console.log("login", r.status());
await p.goto(`${base}/app/dashboard?booth=442`, { waitUntil: "load", timeout: 180000 });
await p.locator("text=Tower wrap").first().waitFor({ timeout: 120000 });
console.log("tower card:", await p.locator("text=Tower wrap").count(), "floor card:", await p.locator("text=Floor graphic").count());
// artwork inputs come in slot order: roll-up, wide, drape, tower, floor (the book inputs follow)
const inputs = p.locator('input[type=file][accept*="pdf"]');
await inputs.nth(3).setInputFiles(`${out}/art-tower.png`); await p.waitForTimeout(5000);
await inputs.nth(4).setInputFiles(`${out}/art-floor.png`); await p.waitForTimeout(6000);
const d = await (await p.request.get(`${base}/api/booth/442`)).json(); console.log("art flags", JSON.stringify(d.booth.art));
await p.screenshot({ path: `${out}/dash-island-art.png`, fullPage: true });
for (const [name, cam] of [["front", "-5,34,-100,-5,0,-72"], ["west", "-26,9,-72,-5,2.5,-72"]]) {
  await p.goto(`${base}/app?clean=1&cam=${cam}`, { waitUntil: "load", timeout: 180000 });
  await p.waitForTimeout(22000);
  await p.screenshot({ path: `${out}/island-art-${name}.png` });
}
await b.close();
