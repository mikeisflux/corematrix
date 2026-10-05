import { chromium } from "playwright";
const S = process.argv[2];
const base = "http://localhost:3000";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
const login = async (email) => { const r = await page.request.post(`${base}/api/auth/request`, { data: { email } }); const { devLink } = await r.json(); await page.goto(devLink, { waitUntil: "networkidle" }); };
await login("buyer-smoke@example.com");
const hall = await (await page.request.get(`${base}/api/hall`)).json();
const claimedIds = new Set(hall.booths.map((b) => b.id));
let boothId = 1; while (claimedIds.has(boothId)) boothId++;
console.log("booth", boothId);
let r = await page.request.post(`${base}/api/checkout`, { data: { kind: "claim", boothId, draft: { name: "Smoke Test Comics", tagline: "indie books", website: "https://example.com", color: "#ff2d55", style: "comic", category: "comics" } } });
let j = await r.json(); console.log("checkout", r.status(), j);
const txId = j.txId;
await page.goto(j.url, { waitUntil: "networkidle", timeout: 120000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: `${S}/co_frame.png`, fullPage: true });
const frame = page.frames().find((f) => f.url().includes("/checkout/simulate"));
console.log("simulator frame", !!frame);
if (frame) { await frame.click("button:has-text(\"Pay now\")"); await page.waitForTimeout(4000); }
await page.screenshot({ path: `${S}/co_after.png`, fullPage: true });
console.log("url after pay", page.url());
// check tx
await login("admin@example.com");
r = await page.request.get(`${base}/api/admin/transactions/${txId}`); j = await r.json();
console.log("tx status", j.tx?.status, j.tx?.provider, j.tx?.providerRef, "booth owner?", j.booth?.ownerId, "mail", j.mail?.map((m) => `${m.subject}:${m.status}`), "webhooks", j.webhooks?.map((w) => `${w.type}:${w.status}`));
// tier setup flow
await login("buyer-smoke@example.com");
r = await page.request.post(`${base}/api/checkout`, { data: { kind: "tier", boothId, tier: "pro" } }); j = await r.json(); console.log("tier checkout", r.status(), j);
const tierTx = j.txId;
await page.goto(j.url, { waitUntil: "networkidle", timeout: 120000 }); await page.waitForTimeout(2000);
await page.screenshot({ path: `${S}/co_setup.png`, fullPage: true });
const f2 = page.frames().find((f) => f.url().includes("/checkout/simulate"));
if (f2) { await f2.click("button:has-text(\"Save card\")"); await page.waitForTimeout(4000); }
console.log("url after setup", page.url());
await login("admin@example.com");
r = await page.request.get(`${base}/api/admin/transactions/${tierTx}`); j = await r.json();
console.log("tier tx", j.tx?.status, "booth tier", j.booth?.tier);
r = await page.request.get(`${base}/api/admin/booths/${boothId}`); j = await r.json(); console.log("booth", j.booth?.tier, j.booth?.subscriptionStatus, j.booth?.subscriptionId, "owner", j.owner?.email);
// refund the claim partially then fully
r = await page.request.post(`${base}/api/admin/transactions/${txId}`, { data: { action: "refund", amountCents: 100, reason: "smoke partial" } }); console.log("partial refund", r.status(), await r.text());
r = await page.request.post(`${base}/api/admin/transactions/${txId}`, { data: { action: "refund", reason: "smoke full" } }); console.log("full refund", r.status(), await r.text());
r = await page.request.get(`${base}/api/admin/booths/${boothId}`); j = await r.json(); console.log("booth after refund owner", j.booth?.ownerId, "hidden", j.booth?.hidden);
// webhooks page + reprocess
r = await page.request.get(`${base}/api/admin/webhooks`); j = await r.json(); console.log("webhooks", j.total, j.rows.slice(0, 4).map((w) => `${w.type}:${w.status}:${w.error || ""}`));
if (j.rows[0]) { r = await page.request.post(`${base}/api/admin/webhooks/${j.rows[0].id}/reprocess`); console.log("reprocess", r.status(), await r.text()); }
await page.goto(base + "/admin/webhooks", { waitUntil: "networkidle" }); await page.screenshot({ path: `${S}/adm_webhooks2.png`, fullPage: true });
await page.goto(base + `/admin/transactions/${txId}`, { waitUntil: "networkidle" }); await page.screenshot({ path: `${S}/adm_tx.png`, fullPage: true });
await page.goto(base + "/admin/emails?folder=all", { waitUntil: "networkidle" }); await page.waitForTimeout(800); await page.click("text=Smoke Test").catch(() => {}); await page.waitForTimeout(800); await page.screenshot({ path: `${S}/adm_inbox.png`, fullPage: true });
r = await page.request.get(`${base}/api/admin/audit`); j = await r.json(); console.log("audit", j.total, j.rows.slice(0, 5).map((a) => a.action));
console.log(errors.join("\n") || "no page errors");
await browser.close();
