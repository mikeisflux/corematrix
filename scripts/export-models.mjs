/**
 * Regenerates public/models/*.glb from the procedural builders in
 * src/lib/hall/modelkit via the dev page /dev/models (needs `npm run dev` on :3000).
 */
import { chromium } from "playwright";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
const base = process.env.BASE_URL || "http://localhost:3000";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
const page = await browser.newPage();
page.on("pageerror", (e) => console.error("pageerror:", e.message));
await page.goto(`${base}/dev/models`, { waitUntil: "networkidle", timeout: 180000 });
await page.waitForFunction(() => typeof window.__exportModels === "function", null, { timeout: 60000 });
const out = await page.evaluate(() => window.__exportModels());
const manifestPath = "public/models/manifest.json";
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : { models: {} };
for (const [name, b64] of Object.entries(out)) {
  const buf = Buffer.from(b64, "base64");
  writeFileSync(`public/models/${name}.glb`, buf);
  manifest.models[name] = { file: `/models/${name}.glb`, bytes: buf.length, generated: true };
  console.log(`${name}.glb  ${(buf.length / 1024).toFixed(0)} KB`);
}
manifest.models.robot = { file: "/models/robot.glb", bytes: 463988, generated: false, license: "CC0 — RobotExpressive by Tomás Laulhé" };
manifest.generatedAt = new Date().toISOString();
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
await browser.close();
