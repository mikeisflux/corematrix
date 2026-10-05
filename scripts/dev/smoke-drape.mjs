// Upload a square logo as the table drape on the house booth, and a logo via the Edit form, then look at a table.
import { chromium } from "playwright";
const out = "/tmp/claude-0/-home-user-corematrix/80df1d3b-37c9-5f70-bd13-ed1efde32587/scratchpad";
const base = "http://localhost:3000";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
const p = await ctx.newPage();
const art = await ctx.newPage();
await art.setContent(`<body style="margin:0;width:600px;height:600px;background:transparent"><div style="width:600px;height:600px;border-radius:120px;background:#ffd166;display:grid;place-items:center;font:900 300px Arial;color:#0b0f1a">F</div></body>`);
await art.screenshot({ path: `${out}/logo-sq.png`, omitBackground: true });
await art.close();
await p.request.post(`${base}/api/auth/password`, { data: { email: "divinitycomicsinc@gmail.com", password: "DFLKji4i9ksl" } });
// drape via the API path the dashboard uses
const fs = await import("node:fs");
const buf = fs.readFileSync(`${out}/logo-sq.png`);
let r = await p.request.post(`${base}/api/art/upload`, { multipart: { slot: "drape", file: { name: "logo.png", mimeType: "image/png", buffer: buf } } }); let j = await r.json(); console.log("drape upload", r.status(), j.width, j.height, (j.url || "").slice(0, 22));
r = await p.request.post(`${base}/api/booth/442/art`, { data: { slot: "drape", url: j.url } }); console.log("drape save", r.status(), JSON.stringify((await r.json()).art));
// logo via the Edit form (auto-save)
await p.goto(`${base}/app/dashboard?booth=442`, { waitUntil: "networkidle" }); await p.waitForTimeout(800);
await p.locator('input[type=file][accept="image/*"]').setInputFiles(`${out}/logo-sq.png`); await p.waitForTimeout(3000);
console.log("msg:", await p.locator("text=Logo saved").count());
const d = await (await p.request.get(`${base}/api/booth/442`)).json(); console.log("logoUrl prefix", (d.booth.logoUrl || "").slice(0, 22), "len", (d.booth.logoUrl || "").length);
await p.goto(`${base}/app?clean=1&cam=18,7,-74,-5,3,-72`, { waitUntil: "load", timeout: 180000 }); await p.waitForTimeout(6000);
await p.screenshot({ path: `${out}/drape.png` });
await b.close();
