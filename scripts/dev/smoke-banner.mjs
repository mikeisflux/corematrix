// Claims a booth in test mode, buys a taller banner, checks it landed on the booth and in /api/hall.
import { chromium } from "playwright";
const base = "http://localhost:3000";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
const page = await (await browser.newContext()).newPage();
const login = async (email) => { await page.request.post(`${base}/api/auth/register`, { data: { email, password: "smoke-test-pass-1" } }); await page.request.post(`${base}/api/auth/signout`).catch(() => null); const r = await page.request.post(`${base}/api/auth/password`, { data: { email, password: "smoke-test-pass-1" } }); if (!r.ok()) throw new Error("login failed " + email); };
const pay = async (url, button) => { await page.goto(url, { waitUntil: "networkidle", timeout: 120000 }); await page.waitForTimeout(1500); const f = page.frames().find((f) => f.url().includes("/checkout/simulate")); if (!f) throw new Error("no simulator frame"); await f.click(`button:has-text("${button}")`); await page.waitForTimeout(3500); };
await login("banner-smoke@example.com");
const hall = await (await page.request.get(`${base}/api/hall`)).json();
const claimed = new Set(hall.booths.map((b) => b.id));
let boothId = 1; while (claimed.has(boothId)) boothId++;
let r = await page.request.post(`${base}/api/checkout`, { data: { kind: "claim", boothId, draft: { name: "Banner Smoke", color: "#2563eb", style: "classic", category: "comics" } } });
let j = await r.json(); console.log("claim", r.status(), j.txId ? "ok" : j);
await pay(j.url, "Pay now");
r = await page.request.post(`${base}/api/checkout`, { data: { kind: "banner", boothId, height: 12 } }); j = await r.json(); console.log("banner checkout", r.status(), j.txId ? "ok" : j);
await pay(j.url, "Pay now");
r = await page.request.post(`${base}/api/checkout`, { data: { kind: "banner", boothId, height: 10 } }); console.log("downgrade rejected?", r.status(), (await r.json()).error);
const h2 = await (await page.request.get(`${base}/api/hall`)).json();
const b = h2.booths.find((x) => x.id === boothId); console.log("hall booth", boothId, "bannerHeight", b?.bannerHeight, "value", b?.valueCents);
const d = await (await page.request.get(`${base}/api/booth/${boothId}`)).json(); console.log("detail bannerHeight", d.booth?.bannerHeight, "history", d.history?.map((h) => `${h.kind}:${h.amountCents}`));
// artist table: capped
const artist = hall.booths.length >= 0 ? 731 : 731;
r = await page.request.post(`${base}/api/checkout`, { data: { kind: "claim", boothId: artist, draft: { name: "Alley Smoke", color: "#16a34a", style: "classic", category: "art" } } }); j = await r.json();
if (j.url) { await pay(j.url, "Pay now"); r = await page.request.post(`${base}/api/checkout`, { data: { kind: "banner", boothId: artist, height: 8 } }); console.log("artist 8ft rejected?", r.status(), (await r.json()).error); }
await browser.close();
