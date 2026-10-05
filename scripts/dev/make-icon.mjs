// Renders the brand mark to public/icon-512.png (shown on DivinityCoin's hosted checkout as the partner logo).
import { chromium } from "playwright";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await b.newPage({ viewport: { width: 512, height: 512 }, deviceScaleFactor: 1 });
await p.setContent(`<html><body style="margin:0;background:#07070f"><div style="width:512px;height:512px;display:grid;place-items:center;background:#07070f">
<div style="position:relative;width:360px;height:360px;border-radius:84px;background:linear-gradient(135deg,#ffe08a,#ff9a3c);box-shadow:0 0 90px rgba(255,207,92,.55)">
<div style="position:absolute;inset:88px;border-radius:28px;background:rgba(7,7,15,.82)"></div>
<div style="position:absolute;inset:0;display:grid;place-items:center;font:900 150px/1 Arial,Helvetica,sans-serif;color:#ffd166;letter-spacing:-6px">F</div>
</div></div></body></html>`);
await p.screenshot({ path: "public/icon-512.png" });
await b.close();
