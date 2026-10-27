// Theater: admin uploads a film through the upload endpoint, sets the caption, reorders; the hall screen plays it and the HUD offers sound.
import { chromium } from "playwright";
import fs from "node:fs";
const out = "/tmp/claude-0/-home-user-corematrix/80df1d3b-37c9-5f70-bd13-ed1efde32587/scratchpad";
const base = "http://localhost:3000";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist", "--autoplay-policy=no-user-gesture-required"] });
const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 } });
const p = await ctx.newPage();
p.on("pageerror", (e) => console.log("pageerror", e.message.slice(0, 200)));
let r = await p.request.post(`${base}/api/auth/password`, { data: { email: "divinitycomicsinc@gmail.com", password: "DFLKji4i9ksl" } }); console.log("login", r.status());
const file = fs.readFileSync(`${out}/demo-reel.webm`);
r = await p.request.put(`${base}/api/admin/theater/upload?name=Demo%20reel.webm&type=video/webm&duration=12&size=${file.length}`, { data: file, headers: { "Content-Type": "video/webm" } });
console.log("upload", r.status(), (await r.text()).slice(0, 160));
r = await p.request.post(`${base}/api/admin/theater`, { data: { url: "https://example.com/missing.mp4", title: "Broken link", duration: 0 } }); console.log("add url", r.status());
r = await p.request.put(`${base}/api/admin/settings`, { data: { key: "THEATER_TITLE", value: "Divinity Comics trailers" } }); console.log("title", r.status());
let list = await (await p.request.get(`${base}/api/admin/theater`)).json(); console.log("rows", list.rows.map((x) => `${x.title}:${x.kind}:${x.duration}:${x.bytes}`), "dir", list.dir);
// disable the broken link, keep the upload first
const broken = list.rows.find((x) => x.kind === "url");
r = await p.request.patch(`${base}/api/admin/theater/${broken.id}`, { data: { enabled: false } }); console.log("disable", r.status());
const pub = await (await p.request.get(`${base}/api/theater`)).json(); console.log("public playlist", JSON.stringify(pub.items), pub.title);
// range request on the file
r = await p.request.get(`${base}${pub.items[0].url}`, { headers: { Range: "bytes=0-99" } }); console.log("range", r.status(), r.headers()["content-range"], r.headers()["content-type"]);
await p.goto(`${base}/admin/theater`, { waitUntil: "load", timeout: 180000 });
await p.locator("text=Playlist").first().waitFor({ timeout: 120000 }); await p.waitForTimeout(1500);
await p.screenshot({ path: `${out}/admin-theater.png`, fullPage: true });
// the screen in the hall, from the benches
await p.goto(`${base}/app?clean=1&cam=0,8,20,0,9,41`, { waitUntil: "load", timeout: 180000 });
await p.waitForTimeout(25000);
await p.screenshot({ path: `${out}/theater-screen.png` });
await p.waitForTimeout(4000);
await p.screenshot({ path: `${out}/theater-screen2.png` });
await b.close();
