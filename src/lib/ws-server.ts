/**
 * The hall's WebSocket: one per open tab, carrying the same messages as /api/live downstream and the presence
 * reports upstream (a frame every 160 ms while walking is far cheaper than a POST each: no cookie parsing, no
 * session lookup, no route overhead per report). Attached to the Node server in server/index.ts; `next dev` has
 * no custom server, so the client falls back to the stream and the POST there.
 */
import type { IncomingMessage } from "node:http";
import type { WebSocket } from "ws";
import { subscribe, onlineCount, type LiveMessage } from "@/lib/realtime";
import { identityFromCookies } from "@/lib/live-auth";
import { ingestPresence } from "@/lib/presence-ingest";
import { removePlayer, ensurePresenceTicker } from "@/lib/presence";
import { admitOrQueue, queueStatusFor } from "@/lib/queue";
import { bumpSiteDaily } from "@/lib/analytics";

const ipOf = (req: IncomingMessage) => { const xff = String(req.headers["x-forwarded-for"] || "").split(",").map((s) => s.trim()).filter(Boolean); return xff[xff.length - 1] || String(req.headers["x-real-ip"] || "") || req.socket.remoteAddress || "0.0.0.0"; };

export async function handleSocket(ws: WebSocket, req: IncomingMessage) {
  const { visitorId, user } = await identityFromCookies(req.headers.cookie).catch(() => ({ visitorId: null, user: null }));
  if (!visitorId) { ws.close(4401, "open the hall first"); return; } // no visitor cookie yet: the page's first API call sets one, the client reconnects
  const ip = ipOf(req);
  const send = (m: LiveMessage) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m)); };
  const unsub = subscribe(send, visitorId, user?.id ?? null);
  ensurePresenceTicker();
  send({ type: "hello", id: visitorId });
  send({ type: "presence", online: onlineCount() });
  void bumpSiteDaily({ visits: 1 });
  let walked = false; let alive = true;
  const ping = setInterval(() => { if (!alive) { ws.terminate(); return; } alive = false; ws.ping(); }, 25_000);
  ws.on("pong", () => { alive = true; });
  ws.on("message", async (data) => {
    let msg: { t?: string } & Record<string, unknown>;
    try { msg = JSON.parse(String(data)); } catch { return; }
    if (msg.t === "p" || msg.t === "leave") {
      const { t: _t, ...body } = msg; void _t;
      const r = await ingestPresence(visitorId, msg.t === "leave" ? { leave: true } : body, { user, ip, admit: () => admitOrQueue(visitorId, user) });
      if (r.ok) walked = msg.t !== "leave";
      else if (r.code === "queue") send(await queueStatusFor(visitorId));
      else send({ type: "error", code: r.code ?? "presence", message: r.error });
    } else if (msg.t === "queue") send(await queueStatusFor(visitorId));
  });
  const bye = () => { clearInterval(ping); unsub(); if (walked) removePlayer(visitorId); };
  ws.on("close", bye); ws.on("error", bye);
}
