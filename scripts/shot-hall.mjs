import { chromium } from "playwright";
const S = process.argv[2]; const base = "http://localhost:3000";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = []; page.on("pageerror", (e) => errors.push("pageerror: " + e.message)); page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 300)); });
await page.goto(base + "/", { waitUntil: "networkidle", timeout: 180000 });
await page.waitForTimeout(12000);
await page.screenshot({ path: `${S}/hall_map.png` });
// fly to an island booth
await page.goto(base + "/?booth=406", { waitUntil: "networkidle", timeout: 180000 });
await page.waitForTimeout(9000);
await page.screenshot({ path: `${S}/hall_booth.png` });
// claim panel
await page.goto(base + "/?claim=1", { waitUntil: "networkidle", timeout: 180000 });
await page.waitForTimeout(8000);
await page.screenshot({ path: `${S}/hall_claim.png` });
// avatar panel + walk
await page.click('button[title="Your avatar"]'); await page.waitForTimeout(2500);
await page.screenshot({ path: `${S}/hall_avatar.png` });
await page.click("text=Walk the floor →"); await page.waitForTimeout(3000);
await page.keyboard.down("w"); await page.waitForTimeout(2500); await page.keyboard.up("w");
await page.waitForTimeout(1500);
await page.screenshot({ path: `${S}/hall_walk.png` });
await page.keyboard.press("v"); await page.keyboard.down("w"); await page.waitForTimeout(1500); await page.keyboard.up("w"); await page.waitForTimeout(800);
await page.screenshot({ path: `${S}/hall_fp.png` });
await page.click('button[title="After hours"]'); await page.waitForTimeout(2500);
await page.screenshot({ path: `${S}/hall_night.png` });
console.log(errors.slice(0, 10).join("\n") || "no errors");
await browser.close();
