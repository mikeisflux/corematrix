/**
 * In-process pub/sub for server-sent events. On a single Node instance this
 * is all you need; swap the bus for Redis pub/sub when you scale out.
 */
export type LiveMessage =
  | { type: "event"; event: { id: string; type: string; boothId: number | null; title: string; detail: string | null; amountCents: number | null; createdAt: number } }
  | { type: "booth"; booth: { id: number; valueCents: number; name: string | null; color: string; accent: string; style: string; cloth: string; category: string; tier: string; hasLogo: boolean; tagline: string | null; website: string | null; size: string; kind: string; label: string; hall: string } }
  | { type: "presence"; online: number }
  | { type: "chat"; message: { id: string; room: string; authorName: string; authorBoothId: number | null; body: string; createdAt: number } }
  | { type: "stats"; totalSalesCents: number; totalViews: number; claimed: number };

type Listener = (m: LiveMessage) => void;

const g = globalThis as unknown as { __forevercomicconBus?: Set<Listener> };
const listeners = (g.__forevercomicconBus ??= new Set<Listener>());

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
