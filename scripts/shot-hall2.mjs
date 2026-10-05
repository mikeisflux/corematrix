import { chromium } from "playwright";
const S = process.argv[2]; const base = "http://localhost:3000";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const errors = []; page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
const shot = async (url, name, wait = 9000) => { await page.goto(base + url, { waitUntil: "networkidle", timeout: 180000 }); await page.waitForTimeout(wait); await page.screenshot({ path: `${S}/${name}.png` }); };
await shot("/?cam=0,60,-40,0,4,-120", "view_entrance");          // looking at the front wall from inside
await shot("/?cam=-120,45,70,-60,4,-20", "view_headliner");       // headliner row + islands
await shot("/?cam=380,40,40,330,4,-40", "view_artist_alley");     // artists' alley
await shot("/?cam=0,420,300,0,0,-20", "view_overview");           // whole hall
await page.goto(base + "/", { waitUntil: "networkidle", timeout: 180000 }); await page.waitForTimeout(6000);
await page.click('button[title="Walk the floor"]'); await page.waitForTimeout(2500);
await page.keyboard.down("w"); await page.waitForTimeout(4000); await page.keyboard.up("w"); await page.waitForTimeout(1200);
await page.screenshot({ path: `${S}/walk2.png` });
await page.keyboard.down("d"); await page.waitForTimeout(1500); await page.keyboard.up("d"); await page.keyboard.down("w"); await page.waitForTimeout(3500); await page.keyboard.up("w"); await page.waitForTimeout(1000);
await page.screenshot({ path: `${S}/walk3.png` });
await page.keyboard.press("v"); await page.waitForTimeout(1200); await page.screenshot({ path: `${S}/walk_fp.png` });
await page.click('button[title="After hours"]'); await page.waitForTimeout(2500); await page.screenshot({ path: `${S}/walk_night.png` });
await page.click('button[title="Your avatar"]'); await page.waitForTimeout(2500); await page.screenshot({ path: `${S}/avatar2.png` });
console.log(errors.slice(0, 5).join("\n") || "no errors");
await browser.close();
