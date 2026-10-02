import { subscribe, onlineCount, type LiveMessage } from "@/lib/realtime";
import { bumpSiteDaily } from "@/lib/analytics";
import { ensureMigrated } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  await ensureMigrated();
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
      unsub = subscribe(send);
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
  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" },
  });
}
