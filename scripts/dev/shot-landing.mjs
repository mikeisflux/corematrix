import { chromium } from "playwright";
const S = process.argv[2];
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = []; page.on("pageerror", (e) => errors.push(e.message)); page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 200)); });
await page.goto("http://localhost:3000/", { waitUntil: "networkidle", timeout: 180000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: `${S}/landing_top.png` });
// scroll through so reveals fire, then full page
for (let y = 0; y < 9000; y += 700) { await page.mouse.wheel(0, 700); await page.waitForTimeout(150); }
await page.waitForTimeout(1200);
await page.screenshot({ path: `${S}/landing_full.png`, fullPage: true });
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
await mobile.goto("http://localhost:3000/", { waitUntil: "networkidle", timeout: 180000 }); await mobile.waitForTimeout(1200);
await mobile.screenshot({ path: `${S}/landing_mobile.png` });
console.log(errors.join("\n") || "no errors");
await browser.close();
