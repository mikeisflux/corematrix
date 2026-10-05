// Close-up of empty booths in walk mode: a 10x10 aisle, the artists' alley, and an island.
import { chromium } from "playwright";
const out = "/tmp/claude-0/-home-user-corematrix/80df1d3b-37c9-5f70-bd13-ed1efde32587/scratchpad";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
p.on("pageerror", (e) => console.log("pageerror", e.message));
for (const [name, cam] of [["aisle", "40,9,-100,40,4,-60"], ["alley", "430,8,-100,430,4,-55"], ["island", "-5,14,-108,-5,3,-72"]]) {
  await p.goto(`http://localhost:3000/app?clean=1&cam=${cam}`, { waitUntil: "load", timeout: 180000 });
  await p.waitForTimeout(5000);
  await p.screenshot({ path: `${out}/booth-${name}.png` });
}
await b.close();
