// Debug run for walk mode: loads the hall, captures console output and screenshots at 1.5s intervals.
// node scripts/dev/debug-walk.mjs [url]
import { chromium } from "playwright";
const url = process.argv[2] || "http://localhost:3000/app?mode=walk";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const seen = new Map();
p.on("console", (m) => { const t = m.type() + ": " + m.text().slice(0, 300); seen.set(t, (seen.get(t) || 0) + 1); });
p.on("pageerror", (e) => { const t = "PAGEERROR: " + String(e.message).slice(0, 400); seen.set(t, (seen.get(t) || 0) + 1); });
await p.goto(url, { waitUntil: "load", timeout: 180000 });
for (const s of [1500, 3000, 6000]) {
  await p.waitForTimeout(s === 1500 ? 1500 : 1500);
  await p.screenshot({ path: `/tmp/claude-0/-home-user-corematrix/80df1d3b-37c9-5f70-bd13-ed1efde32587/scratchpad/walk-${s}.png` });
  console.log("shot", s);
}
for (const [k, v] of seen) console.log(v + "x", k);
await b.close();
