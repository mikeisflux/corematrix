/**
 * In-process pub/sub for server-sent events. On a single Node instance this
 * is all you need; swap the bus for Redis pub/sub when you scale out.
 */
export type LiveMessage =
  | { type: "event"; event: { id: string; type: string; plotId: number | null; title: string; detail: string | null; amountCents: number | null; createdAt: number } }
  | { type: "plot"; plot: { id: number; valueCents: number; name: string | null; color: string; style: string; shape: string; floors: number; roof: string; tier: string; hasLogo: boolean; tagline: string | null; website: string | null; district: string } }
  | { type: "presence"; online: number }
  | { type: "chat"; message: { id: string; room: string; authorName: string; authorPlotId: number | null; body: string; createdAt: number } }
  | { type: "stats"; totalSalesCents: number; totalViews: number; claimed: number };

type Listener = (m: LiveMessage) => void;

const g = globalThis as unknown as { __alwaysonconBus?: Set<Listener> };
const listeners = (g.__alwaysonconBus ??= new Set<Listener>());

export function publish(m: LiveMessage) {
  for (const l of listeners) {
    try {
      l(m);
    } catch {
      /* ignore */
    }
  }
}

export function subscribe(l: Listener): () => void {
  listeners.add(l);
  broadcastPresence();
  return () => {
    listeners.delete(l);
    broadcastPresence();
  };
}

export function onlineCount(): number {
  return listeners.size;
}

let presenceTimer: NodeJS.Timeout | null = null;
function broadcastPresence() {
  if (presenceTimer) return;
  presenceTimer = setTimeout(() => {
    presenceTimer = null;
    publish({ type: "presence", online: listeners.size });
  }, 250);
}
