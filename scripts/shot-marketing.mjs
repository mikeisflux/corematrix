/* HUD-free renders of the hall for the public site: public/marketing/*.jpg */
import { chromium } from "playwright";
const base = "http://localhost:3000";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });
const errors = []; page.on("pageerror", (e) => errors.push(e.message));
const shot = async (url, name, wait = 11000, keys = []) => {
  await page.goto(base + url, { waitUntil: "load", timeout: 180000 }); await page.waitForTimeout(wait);
  for (const [k, ms] of keys) { await page.keyboard.down(k); await page.waitForTimeout(ms); await page.keyboard.up(k); }
  if (keys.length) await page.waitForTimeout(1200);
  await page.screenshot({ path: `public/marketing/${name}.jpg`, type: "jpeg", quality: 86, timeout: 180000 });
  console.log("saved", name);
};
await shot("/app?clean=1&cam=-130,48,80,-50,4,-10", "hero");
await shot("/app?clean=1&cam=0,420,300,0,0,-20", "overview");
await shot("/app?clean=1&cam=40,22,60,0,5,0&night=1", "arcade-night", 12000);
await shot("/app?clean=1&cam=380,40,40,330,4,-40", "artist-alley");
await shot("/app?clean=1&mode=walk", "walk", 9000, [["w", 4200]]);
await shot("/app?clean=1&mode=walk&night=1", "walk-night", 9000, [["w", 3000], ["d", 900], ["w", 2500]]);
console.log(errors.slice(0, 3).join("\n") || "no errors");
await browser.close();
