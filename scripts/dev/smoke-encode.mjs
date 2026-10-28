// Downsampling: upload the demo reel, watch it go processing → ready as MP4, confirm the playlist and the screen.
import { chromium } from "playwright";
import fs from "node:fs";
const out = "/tmp/claude-0/-home-user-corematrix/80df1d3b-37c9-5f70-bd13-ed1efde32587/scratchpad";
const base = "http://localhost:3000";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
let r = await p.request.post(`${base}/api/auth/password`, { data: { email: "divinitycomicsinc@gmail.com", password: "DFLKji4i9ksl" } }); console.log("login", r.status());
// clear the playlist first
const before = await (await p.request.get(`${base}/api/admin/theater`)).json();
for (const row of before.rows) await p.request.delete(`${base}/api/admin/theater/${row.id}`);
console.log("encoder available:", before.encoder, "target", JSON.stringify(before.target));
const file = fs.readFileSync(`${out}/demo-reel.webm`);
const init = await (await p.request.post(`${base}/api/admin/theater/upload/init`, { data: { name: "Demo reel.webm", type: "video/webm", size: file.length, duration: 12 } })).json();
for (let i = 0; i < init.chunks; i++) await p.request.put(`${base}/api/admin/theater/upload/chunk?id=${init.id}&index=${i}`, { data: file.subarray(i * init.chunkBytes, Math.min(file.length, (i + 1) * init.chunkBytes)), headers: { "Content-Type": "application/octet-stream" } });
r = await p.request.post(`${base}/api/admin/theater/upload/complete`, { data: { id: init.id } }); const done = await r.json(); console.log("complete", r.status(), done.row?.status);
let row = null;
for (let t = 0; t < 60; t++) { await new Promise((res) => setTimeout(res, 2000)); const j = await (await p.request.get(`${base}/api/admin/theater`)).json(); row = j.rows.find((x) => x.id === init.id); if (row?.status === "ready") { console.log(`ready after ~${(t + 1) * 2}s`); break; } }
console.log("row", JSON.stringify({ status: row?.status, mime: row?.mime, src: row?.src, bytes: row?.bytes, duration: row?.duration }));
console.log("files:", fs.readdirSync(`${out}/videos`).filter((f) => f.startsWith(init.id)).join(", "));
const pub = await (await p.request.get(`${base}/api/theater`)).json(); console.log("playlist", JSON.stringify(pub.items));
r = await p.request.get(`${base}${pub.items[0].url}`, { headers: { Range: "bytes=0-99" } }); console.log("range", r.status(), r.headers()["content-type"]);
await p.goto(`${base}/app?clean=1&cam=0,10,-2,0,15,41`, { waitUntil: "load", timeout: 180000 });
await p.waitForTimeout(35000);
await p.screenshot({ path: `${out}/theater-encoded.png` });
await b.close();
