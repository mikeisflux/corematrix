/**
 * The production server: Next's request handler on the Node http server, plus the hall's WebSocket at /api/ws
 * (Next route handlers cannot take an upgrade). Bundled by scripts/build-server.mjs into dist/server.cjs, which
 * `npm start` and pm2 run; pm2 cluster mode runs several of these on the same port when REDIS_URL is set.
 */
import "./polyfill";
import { createServer } from "node:http";
import next from "next";
import { WebSocketServer } from "ws";
import { handleSocket } from "../src/lib/ws-server";
import { newId } from "../src/lib/util";
import { VID_COOKIE } from "../src/lib/visitor";

const port = Number(process.env.PORT || 3000);
const hostname = process.env.HOST || "0.0.0.0";
// hostname/port only name the listener; Next builds request URLs from them (not from the Host header), so nothing in the app may derive absolute links from the request URL: use siteUrl() instead
const app = next({ dev: false, dir: process.cwd(), hostname: "localhost", port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => { void handle(req, res); });
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024, perMessageDeflate: false });
  // a first visit has no visitor cookie yet: mint one on the handshake (the browser keeps it like any Set-Cookie) so the socket is usable at once
  const minted = new WeakMap<object, string>();
  wss.on("headers", (headers, req) => { const id = minted.get(req); if (id) headers.push(`Set-Cookie: ${VID_COOKIE}=${id}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax`); });
  server.on("upgrade", (req, socket, head) => {
    const path = (req.url || "").split("?")[0];
    if (path !== "/api/ws") { socket.destroy(); return; }
    if (!new RegExp(`(^|;\\s*)${VID_COOKIE}=`).test(req.headers.cookie || "")) { const id = `v_${newId()}`; minted.set(req, id); req.headers.cookie = `${req.headers.cookie ? req.headers.cookie + "; " : ""}${VID_COOKIE}=${id}`; }
    wss.handleUpgrade(req, socket, head, (ws) => { void handleSocket(ws, req); });
  });
  server.keepAliveTimeout = 65_000;
  server.listen(port, hostname, () => { console.log(`> ForeverComicCon ready on http://${hostname}:${port} (pid ${process.pid}${process.env.REDIS_URL ? ", redis" : ""})`); });
}).catch((e) => { console.error(e); process.exit(1); });
