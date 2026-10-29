import { NextResponse } from "next/server";
import { subscribe, onlineCount, type LiveMessage } from "@/lib/realtime";
import { bumpSiteDaily } from "@/lib/analytics";
import { ensureMigrated } from "@/lib/db";
import { getOrSetVisitor, publicId } from "@/lib/visitor";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  await ensureMigrated();
  const res = new NextResponse(null); // only used to collect a Set-Cookie when the visitor is new
  const visitorId = await publicId(await getOrSetVisitor(res)); // targeted messages go to the public floor id
  const encoder = new TextEncoder();
  let unsub: (() => void) | null = null;
  let ping: NodeJS.Timeout | null = null;
  const stream = new ReadableStream({
    start(controller) {
      const send = (m: LiveMessage) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(m)}\n\n`));
        } catch {
          /* closed */
        }
      };
      unsub = subscribe(send, visitorId);
      send({ type: "hello", id: visitorId }); // so the client can tell if this stream is registered under its real id
      send({ type: "presence", online: onlineCount() });
      ping = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: ping\n\n`));
        } catch {
          /* closed */
        }
      }, 25_000);
      void bumpSiteDaily({ visits: 1 });
    },
    cancel() {
      unsub?.();
      if (ping) clearInterval(ping);
    },
  });
  req.signal.addEventListener("abort", () => {
    unsub?.();
    if (ping) clearInterval(ping);
  });
  const headers = new Headers({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  const setCookie = res.headers.get("set-cookie");
  if (setCookie) headers.set("Set-Cookie", setCookie);
  return new Response(stream, { headers });
}
