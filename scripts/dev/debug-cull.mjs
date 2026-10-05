// Camera looks sideways along the hall from the east end: the origin is out of view, booths must still draw.
import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
await p.goto("http://localhost:3000/app?clean=1&cam=300,9,-60,500,4,-50", { waitUntil: "load", timeout: 180000 });
await p.waitForTimeout(5000);
await p.screenshot({ path: "/tmp/claude-0/-home-user-corematrix/80df1d3b-37c9-5f70-bd13-ed1efde32587/scratchpad/cull.png" });
await b.close();
