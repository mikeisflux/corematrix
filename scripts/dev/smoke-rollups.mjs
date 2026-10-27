// Island roll-ups: four slots, one per side. Upload four different banners to the house booth, check the dashboard cards, look at the island.
import { chromium } from "playwright";
const out = "/tmp/claude-0/-home-user-corematrix/80df1d3b-37c9-5f70-bd13-ed1efde32587/scratchpad";
const base = "http://localhost:3000";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 } });
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("pageerror", e.message.slice(0, 200)));
let r = await p.request.post(`${base}/api/auth/password`, { data: { email: "divinitycomicsinc@gmail.com", password: "DFLKji4i9ksl" } }); console.log("login", r.status());
const art = await ctx.newPage();
const colors = ["#e63946", "#2a9d8f", "#3a86ff", "#ffd166"], names = ["NORTH", "SOUTH", "WEST", "EAST"];
for (let i = 0; i < 4; i++) {
  await art.setContent(`<body style="margin:0;width:600px;height:1200px;background:${colors[i]};color:#0b0f1a;font:900 150px Arial;display:grid;place-items:center">${names[i]}</body>`);
  const png = await art.screenshot({ fullPage: true });
  r = await p.request.post(`${base}/api/art/upload`, { multipart: { file: { name: `${names[i]}.png`, mimeType: "image/png", buffer: png }, slot: `rollup:${i}` } });
  const j = await r.json(); if (!r.ok()) { console.log("upload failed", j); continue; }
  r = await p.request.post(`${base}/api/booth/442/art`, { data: { slot: `rollup:${i}`, url: j.url } }); console.log("save", names[i], r.status());
}
await art.close();
const d = await (await p.request.get(`${base}/api/booth/442`)).json(); console.log("art flags", Object.keys(d.booth.art).filter((k) => k.startsWith("rollup")).join(","));
await p.goto(`${base}/app/dashboard?booth=442`, { waitUntil: "load", timeout: 180000 });
await p.locator("text=Roll-up banner · North").first().waitFor({ timeout: 120000 }); await p.waitForTimeout(800);
console.log("roll-up cards:", await p.locator("text=/^Roll-up banner · /").count(), "wide cards:", await p.locator("text=Wide banner").count());
const artBox = p.locator("text=Banner artwork · free").locator("xpath=..");
await artBox.screenshot({ path: `${out}/dash-rollups.png` });
await p.goto(`${base}/app?clean=1&cam=-5,30,-104,-5,2,-72`, { waitUntil: "load", timeout: 180000 });
await p.waitForTimeout(24000);
await p.screenshot({ path: `${out}/island-rollups.png` });
await b.close();
