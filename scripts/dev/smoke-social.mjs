// Two visitors on the floor: A waves and reacts (B's roster carries it), A messages B privately (only B gets it, with a toast), B replies, bubbles show.
import { chromium } from "playwright";
const out = "/tmp/claude-0/-home-user-corematrix/80df1d3b-37c9-5f70-bd13-ed1efde32587/scratchpad";
const base = "http://localhost:3000";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-webgl", "--ignore-gpu-blocklist"] });
const A = await (await b.newContext({ viewport: { width: 1200, height: 800 } })).newPage();
const B = await (await b.newContext({ viewport: { width: 1200, height: 800 } })).newPage();
const C = await (await b.newContext()).newPage(); // a third person who must NOT see the private chat
for (const [n, p] of [["A", A], ["B", B]]) p.on("pageerror", (e) => console.log(n, "pageerror", e.message.slice(0, 200)));
await A.goto(`${base}/app?mode=walk`, { waitUntil: "load", timeout: 180000 });
await B.goto(`${base}/app?mode=walk`, { waitUntil: "load", timeout: 180000 });
await C.goto(`${base}/app?mode=walk`, { waitUntil: "load", timeout: 180000 });
await A.waitForTimeout(12000);
// names for the guests
await A.evaluate(() => localStorage.setItem("fcc_name", "Alice"));
await B.evaluate(() => localStorage.setItem("fcc_name", "Bob"));
await A.waitForTimeout(2500);
// A waves (key 1) and reacts
await A.keyboard.press("1");
await A.waitForTimeout(1500);
// the roster ticks five times a second; wait until it lists the name we want
const rosterWith = async (page, name) => { for (let i = 0; i < 20; i++) { const r = await page.evaluate(() => new Promise((res) => { const es = new EventSource("/api/live"); const t = setTimeout(() => { es.close(); res([]); }, 3000); es.onmessage = (e) => { const m = JSON.parse(e.data); if (m.type === "players") { clearTimeout(t); es.close(); res(m.players); } }; })); if (r.some((p) => p.n === name)) return r; await page.waitForTimeout(500); } return []; };
const rosterB = await rosterWith(B, "Alice");
console.log("roster as B sees it:", JSON.stringify(rosterB.map((p) => ({ n: p.n, e: p.e?.n ?? null }))));
// ids
const ids = await A.request.get(`${base}/api/dm`).then((r) => r.json());
const me = ids.me;
const rosterNow = await rosterWith(A, "Bob");
const bob = rosterNow.find((p) => p.n === "Bob");
console.log("A is", me, "Bob is", bob?.id);
// A messages Bob through the UI route
let r = await A.request.post(`${base}/api/dm`, { data: { to: bob.id, body: "hey Bob, meet me at the arcade?", name: "Alice" } }); console.log("send", r.status());
await B.waitForTimeout(1500);
console.log("B toast:", await B.locator("text=/💬 Alice/").count() ? "shown" : "missing");
await B.screenshot({ path: `${out}/social-B.png` });
// B replies via API; A's thread should have both; C sees nothing
r = await B.request.post(`${base}/api/dm`, { data: { to: me, body: "on my way", name: "Bob" } }); console.log("reply", r.status());
await A.waitForTimeout(800);
const threadA = await A.request.get(`${base}/api/dm?with=${bob.id}`).then((r) => r.json()); console.log("A thread:", threadA.messages.map((m) => `${m.fromName}: ${m.body}`).join(" | "));
const threadsC = await C.request.get(`${base}/api/dm`).then((r) => r.json()); console.log("C threads:", threadsC.threads.length);
// open the People panel on A and the DM panel
await A.locator('button[title="People & messages"]').click({ force: true }); await A.waitForTimeout(800);
await A.screenshot({ path: `${out}/social-people.png` });
await A.locator("text=Bob").first().click({ force: true }); await A.waitForTimeout(800);
await A.screenshot({ path: `${out}/social-dm.png` });
await b.close();
