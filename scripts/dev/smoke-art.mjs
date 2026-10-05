// Superadmin uploads a PNG and a PDF as banner art on the house booth through the dashboard, then we look at the booth.
import { chromium } from "playwright";
const out = "/tmp/claude-0/-home-user-corematrix/80df1d3b-37c9-5f70-bd13-ed1efde32587/scratchpad";
const base = "http://localhost:3000";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
const ctx = await b.newContext({ viewport: { width: 1300, height: 900 } });
const p = await ctx.newPage();
const errs = []; p.on("pageerror", (e) => errs.push(e.message));
// make a PDF and a PNG to upload
const art = await ctx.newPage();
await art.setContent(`<body style="margin:0;width:1200px;height:2400px;background:linear-gradient(#0b0f1a,#1b1f2a);color:#ffd166;font:900 160px Arial;display:grid;place-items:center"><div>FOREVER<br/>COMIC<br/>CON</div></body>`);
await art.screenshot({ path: `${out}/art-portrait.png`, fullPage: true });
await art.setContent(`<body style="margin:0;width:2000px;height:500px;background:#ffd166;color:#0b0f1a;font:900 220px Arial;display:grid;place-items:center">FOREVERCOMICCON</body>`);
await art.pdf({ path: `${out}/art-wide.pdf`, width: "2000px", height: "500px", printBackground: true });
await art.close();
let r = await p.request.post(`${base}/api/auth/password`, { data: { email: "divinitycomicsinc@gmail.com", password: "DFLKji4i9ksl" } }); console.log("login", r.status());
await p.goto(`${base}/app/dashboard?booth=442`, { waitUntil: "networkidle", timeout: 120000 });
await p.waitForTimeout(1000);
const inputs = p.locator('input[type=file][accept*="pdf"]');
console.log("art inputs", await inputs.count());
await inputs.nth(0).setInputFiles(`${out}/art-portrait.png`);
await p.waitForTimeout(4000);
await inputs.nth(1).setInputFiles(`${out}/art-wide.pdf`);
await p.waitForTimeout(8000);
await p.screenshot({ path: `${out}/dash-art.png`, fullPage: true });
const d = await (await p.request.get(`${base}/api/booth/442`)).json(); console.log("art flags", JSON.stringify(d.booth.art), "tier", d.booth.tier, "banner", d.booth.bannerHeight);
for (const s of ["portrait", "wide"]) { const a = await p.request.get(`${base}/api/art/442/${s}`); console.log(s, a.status(), a.headers()["content-type"], (await a.body()).length); }
await p.goto(`${base}/app?clean=1&cam=-5,16,-112,-5,6,-72`, { waitUntil: "load", timeout: 180000 });
await p.waitForTimeout(6000);
await p.screenshot({ path: `${out}/house.png` });
console.log("errors", errs);
await b.close();
