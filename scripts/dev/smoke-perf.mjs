// Performance capture: walk the hall, open the gear menu, export JSON, confirm the server stored the session and the admin page shows it.
import { chromium } from "playwright";
import fs from "node:fs";
const out = "/tmp/claude-0/-home-user-corematrix/80df1d3b-37c9-5f70-bd13-ed1efde32587/scratchpad";
const base = "http://localhost:3000";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
const ctx = await b.newContext({ viewport: { width: 1300, height: 860 }, acceptDownloads: true });
const p = await ctx.newPage();
const posts = [];
p.on("request", (r) => { if (r.url().endsWith("/api/perf") && r.method() === "POST") posts.push(JSON.parse(r.postData() || "{}")); });
p.on("console", (m) => { if (m.type() === "error") console.log("console.error", m.text().slice(0, 200)); });
await p.goto(`${base}/app?mode=walk`, { waitUntil: "load", timeout: 180000 });
await p.waitForTimeout(14000);
await p.keyboard.press("p");
await p.waitForTimeout(1500);
await p.screenshot({ path: `${out}/perf-overlay.png` });
await p.click('button[title="Settings"], button[aria-label="Settings"]').catch(async () => { await p.getByText("⚙️").first().click(); });
await p.waitForTimeout(800);
await p.screenshot({ path: `${out}/perf-settings.png` });
// lock quality to low and lighten the crowd
await p.getByRole("button", { name: "Low", exact: true }).click();
await p.getByRole("button", { name: "Light", exact: true }).click();
await p.waitForTimeout(1500);
const [dl] = await Promise.all([p.waitForEvent("download"), p.getByRole("button", { name: "Export JSON" }).click()]);
const path = `${out}/${dl.suggestedFilename()}`; await dl.saveAs(path);
const json = JSON.parse(fs.readFileSync(path, "utf8"));
console.log("export:", dl.suggestedFilename(), "samples", json.samples.length, "gpu", json.device?.gpu?.slice(0, 50), "summary", JSON.stringify(json.summary));
console.log("last sample", JSON.stringify(json.samples.at(-1)));
console.log("posts sent", posts.length, "first post samples", posts[0]?.samples?.length, "id", posts[0]?.id);
console.log("prefs", await p.evaluate(() => localStorage.getItem("fcc_prefs")));
await p.waitForTimeout(11000); // one more flush after the prefs change
await p.screenshot({ path: `${out}/perf-settings-low.png` });
// admin
const admin = await (await b.newContext({ viewport: { width: 1400, height: 1000 }, acceptDownloads: true })).newPage();
let r = await admin.request.post(`${base}/api/auth/password`, { data: { email: "divinitycomicsinc@gmail.com", password: "DFLKji4i9ksl" } }); console.log("admin login", r.status());
r = await admin.request.get(`${base}/api/admin/perf`); const list = await r.json(); console.log("admin list", r.status(), "total", list.total, "first", JSON.stringify({ id: list.rows[0]?.id, s: list.rows[0]?.summary }));
r = await admin.request.get(`${base}/api/admin/perf/${list.rows[0].id}?format=text`); console.log("report:\n" + (await r.text()).split("\n").slice(0, 9).join("\n"));
r = await admin.request.get(`${base}/api/admin/perf?format=json`); console.log("export all", r.status(), r.headers()["content-disposition"], (await r.text()).length, "bytes");
await admin.goto(`${base}/admin/performance`, { waitUntil: "networkidle" });
await admin.waitForTimeout(1500);
await admin.screenshot({ path: `${out}/perf-admin.png`, fullPage: true });
// hover the chart
const svg = admin.locator("svg").last(); const box = await svg.boundingBox(); if (box) { await admin.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2); await admin.waitForTimeout(400); await admin.screenshot({ path: `${out}/perf-admin-hover.png`, clip: { x: box.x - 10, y: box.y - 120, width: box.width + 20, height: box.height + 140 } }); }
await b.close();
