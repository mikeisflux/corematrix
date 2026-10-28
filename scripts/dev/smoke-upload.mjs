// Resumable film upload: send half the chunks, "drop", resume from status, complete; then a range read of the result.
import { chromium } from "playwright";
import fs from "node:fs";
import crypto from "node:crypto";
const out = "/tmp/claude-0/-home-user-corematrix/80df1d3b-37c9-5f70-bd13-ed1efde32587/scratchpad";
const base = "http://localhost:3000";
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const p = await (await b.newContext()).newPage();
let r = await p.request.post(`${base}/api/auth/password`, { data: { email: "divinitycomicsinc@gmail.com", password: "DFLKji4i9ksl" } }); console.log("login", r.status());
// a 21 MB "webm" (random bytes with the real demo reel at the front so the type check and sniffing are happy)
const reel = fs.readFileSync(`${out}/demo-reel.webm`);
const file = Buffer.concat([reel, crypto.randomBytes(70 * 1024 * 1024 - reel.length)]);
const sha = crypto.createHash("sha256").update(file).digest("hex");
r = await p.request.post(`${base}/api/admin/theater/upload/init`, { data: { name: "Resumable test.webm", type: "video/webm", size: file.length, duration: 12 } });
const init = await r.json(); console.log("init", r.status(), JSON.stringify(init));
const { id, chunkBytes, chunks } = init;
const send = async (i) => { const rr = await p.request.put(`${base}/api/admin/theater/upload/chunk?id=${id}&index=${i}`, { data: file.subarray(i * chunkBytes, Math.min(file.length, (i + 1) * chunkBytes)), headers: { "Content-Type": "application/octet-stream" } }); if (!rr.ok()) console.log("chunk", i, rr.status(), await rr.text()); };
// first half, out of order, with a duplicate
await send(1); await send(0); await send(1);
r = await p.request.post(`${base}/api/admin/theater/upload/complete`, { data: { id } }); console.log("complete too early", r.status(), (await r.json()).error);
const st = await (await p.request.get(`${base}/api/admin/theater/upload/status?id=${id}`)).json(); console.log("status received", st.received, "of", st.chunks);
await Promise.all(Array.from({ length: chunks }, (_, i) => i).filter((i) => !st.received.includes(i)).map(send)); // the rest in parallel, like the browser does
r = await p.request.post(`${base}/api/admin/theater/upload/complete`, { data: { id } }); const done = await r.json(); console.log("complete", r.status(), done.row?.title, done.row?.bytes);
// the stored file must be byte-identical
const got = await (await p.request.get(`${base}/api/theater/file/${done.row.id}`)).body();
console.log("bytes match:", got.length === file.length && crypto.createHash("sha256").update(got).digest("hex") === sha);
r = await p.request.get(`${base}/api/theater/file/${done.row.id}`, { headers: { Range: "bytes=1000-1999" } }); console.log("range", r.status(), r.headers()["content-range"]);
// wrong-size chunk is refused, unknown upload is 404
r = await p.request.put(`${base}/api/admin/theater/upload/chunk?id=${id}&index=0`, { data: Buffer.alloc(10), headers: { "Content-Type": "application/octet-stream" } }); console.log("after complete:", r.status());
await p.request.delete(`${base}/api/admin/theater/${done.row.id}`);
await b.close();
