// The house booth (a claimed island) from above-front: tables must run along each edge, banners behind them.
import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto("http://localhost:3000/app?clean=1&cam=-5,40,-104,-5,2,-72", { waitUntil: "load", timeout: 180000 });
await p.waitForTimeout(6000);
await p.screenshot({ path: "/tmp/claude-0/-home-user-corematrix/80df1d3b-37c9-5f70-bd13-ed1efde32587/scratchpad/island-top.png" });
await b.close();
