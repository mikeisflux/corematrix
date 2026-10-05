// Credit → PayPal payout queue: request, admin marks paid, second request rejected (credit returned).
import { chromium } from "playwright";
const out = "/tmp/claude-0/-home-user-corematrix/80df1d3b-37c9-5f70-bd13-ed1efde32587/scratchpad";
const base = "http://localhost:3000";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const user = await (await b.newContext({ viewport: { width: 1300, height: 900 } })).newPage();
const admin = await (await b.newContext({ viewport: { width: 1400, height: 900 } })).newPage();
const login = async (p, email, pw) => { await p.request.post(`${base}/api/auth/register`, { data: { email, password: pw } }); const r = await p.request.post(`${base}/api/auth/password`, { data: { email, password: pw } }); if (!r.ok()) throw new Error("login " + email); };
await login(user, "seller-smoke@example.com", "smoke-test-pass-1");
await login(admin, "divinitycomicsinc@gmail.com", "DFLKji4i9ksl");
const me = await (await user.request.get(`${base}/api/me`)).json();
let r = await admin.request.patch(`${base}/api/admin/users/${me.user.id}`, { data: { creditDeltaCents: 8000, reason: "smoke: takeover payout" } }); console.log("grant credit", r.status());
r = await user.request.post(`${base}/api/payouts`, { data: { amountCents: 1000, paypalEmail: "x@y.com", legalName: "Sam Seller", address: "1 Main St, Springfield, IL 62701" } }); console.log("below minimum rejected?", r.status(), (await r.json()).error);
r = await user.request.post(`${base}/api/payouts`, { data: { amountCents: 5000, paypalEmail: "seller@paypal.example", legalName: "Sam Seller", address: "1 Main St, Springfield, IL 62701" } }); let j = await r.json(); console.log("request", r.status(), j.payout?.status, j.payout?.amountCents);
const id1 = j.payout?.id;
console.log("credit after request", (await (await user.request.get(`${base}/api/me`)).json()).user.creditCents);
r = await user.request.post(`${base}/api/payouts`, { data: { amountCents: 2500, paypalEmail: "seller@paypal.example", legalName: "Sam Seller", address: "1 Main St" } }); console.log("second while pending?", r.status(), (await r.json()).error);
r = await admin.request.get(`${base}/api/admin/payouts?status=pending`); j = await r.json(); console.log("admin queue", j.total, "owed", j.totals.owedCents);
await admin.goto(`${base}/admin/payouts`, { waitUntil: "networkidle" }); await admin.waitForTimeout(800); await admin.screenshot({ path: `${out}/adm-payouts.png`, fullPage: true });
r = await admin.request.post(`${base}/api/admin/payouts/${id1}`, { data: { action: "paid", reference: "PAYPAL-TX-123" } }); console.log("mark paid", r.status(), (await r.json()).payout?.status);
r = await user.request.post(`${base}/api/payouts`, { data: { amountCents: 3000, paypalEmail: "seller@paypal.example", legalName: "Sam Seller", address: "1 Main St, Springfield, IL 62701" } }); j = await r.json(); console.log("request 2", r.status(), j.payout?.status);
r = await admin.request.post(`${base}/api/admin/payouts/${j.payout.id}`, { data: { action: "reject", reason: "PayPal email bounced" } }); console.log("reject", r.status(), (await r.json()).payout?.status);
console.log("credit after reject (expect 3000)", (await (await user.request.get(`${base}/api/me`)).json()).user.creditCents);
r = await admin.request.get(`${base}/api/admin/payouts?status=`); j = await r.json(); console.log("totals", JSON.stringify(j.totals));
r = await admin.request.get(`${base}/api/admin/emails/logs?q=payout`).catch(() => null); if (r) { const l = await r.json().catch(() => ({})); console.log("payout emails logged", l.total ?? l.rows?.length ?? "?"); }
await user.goto(`${base}/app/dashboard`, { waitUntil: "networkidle" }); await user.waitForTimeout(1200); await user.screenshot({ path: `${out}/dash-payouts.png`, fullPage: false });
await admin.goto(`${base}/admin`, { waitUntil: "networkidle" }); await admin.waitForTimeout(800); await admin.screenshot({ path: `${out}/adm-dash.png`, fullPage: false });
await b.close();
