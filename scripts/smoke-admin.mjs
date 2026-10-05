import { chromium } from "playwright";
const S = process.argv[2];
const base = "http://localhost:3000";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
const page = await ctx.newPage();
const login = async (pg, email) => { await pg.request.post(`${base}/api/auth/register`, { data: { email, password: "smoke-test-pass-1" } }); const r = await pg.request.post(`${base}/api/auth/password`, { data: { email, password: "smoke-test-pass-1" } }); if (!r.ok()) throw new Error("login failed " + email); };
const errors = [];
page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
page.on("console", (m) => { if (m.type() === "error") errors.push("console: " + m.text().slice(0, 300)); });
await login(page, "admin@example.com");
const pages = ["/admin", "/admin/transactions", "/admin/booths", "/admin/users", "/admin/plans", "/admin/billboards", "/admin/emails", "/admin/emails/templates", "/admin/emails/logs", "/admin/webhooks", "/admin/audit", "/admin/settings"];
for (const p of pages) {
  const res = await page.goto(base + p, { waitUntil: "networkidle", timeout: 120000 });
  await page.waitForTimeout(800);
  const name = p.replace(/\//g, "_").replace(/^_/, "") || "admin";
  await page.screenshot({ path: `${S}/adm_${name}.png`, fullPage: true });
  const txt = (await page.locator("main").innerText().catch(() => "")).slice(0, 120).replace(/\n/g, " | ");
  console.log(res.status(), p, "::", txt);
}
// API probes
for (const u of ["/api/admin/stats", "/api/admin/emails?folder=all", "/api/admin/emails/templates", "/api/admin/webhooks", "/api/admin/users", "/api/admin/transactions", "/api/admin/booths", "/api/admin/plans", "/api/admin/billboards", "/api/admin/audit", "/api/admin/settings"]) {
  const res = await page.request.get(base + u);
  const body = await res.text();
  console.log(res.status(), u, body.slice(0, 100).replace(/\n/g, " "));
}
// seed templates + a test email (will log as failed w/o key) + test divinity
let res = await page.request.post(`${base}/api/admin/emails/templates/seed`); console.log("seed", res.status(), await res.text());
res = await page.request.post(`${base}/api/admin/settings/test-divinity`); console.log("test-divinity", res.status(), await res.text());
res = await page.request.post(`${base}/api/admin/settings/test-email`); console.log("test-email", res.status(), (await res.text()).slice(0, 200));
// draft -> send
res = await page.request.post(`${base}/api/admin/emails/draft`, { data: { to: "someone@example.com", subject: "Hello from admin", html: "<p>Hi there</p>" } });
const draft = await res.json(); console.log("draft", res.status(), draft.row?.id);
res = await page.request.post(`${base}/api/admin/emails/draft/${draft.row.id}/send`, { data: {} }); console.log("draft send", res.status(), (await res.text()).slice(0, 200));
// inbound parse simulation
const key = (await (await page.request.get(`${base}/api/admin/settings?reveal=1&key=INBOUND_EMAIL_KEY`)).json()).value;
console.log("inbound key set:", !!key);
await page.goto(base + "/admin/emails", { waitUntil: "networkidle" });
await page.screenshot({ path: `${S}/adm_emails2.png`, fullPage: true });
console.log(errors.join("\n") || "no page errors");
await browser.close();
