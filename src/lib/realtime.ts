/**
 * In-process pub/sub for server-sent events. On a single Node instance this
 * is all you need; swap the bus for Redis pub/sub when you scale out.
 */
export type LiveMessage =
  | { type: "event"; event: { id: string; type: string; boothId: number | null; title: string; detail: string | null; amountCents: number | null; createdAt: number } }
  | { type: "booth"; booth: { art?: Record<string, number>; house?: boolean; bannerHeight?: number; bookSlots?: number; logoVersion?: number; id: number; valueCents: number; name: string | null; color: string; accent: string; style: string; cloth: string; category: string; tier: string; hasLogo: boolean; tagline: string | null; website: string | null; artstation?: string | null; deviantart?: string | null; instagram?: string | null; xUrl?: string | null; size: string; kind: string; label: string; hall: string } }
  | { type: "presence"; online: number }
  | { type: "hello"; id: string } // the visitor id this stream is registered under
  | { type: "players"; players: Array<{ id: string; n: string; a: unknown; x: number; z: number; h: number; s: number; e?: { n: string; t: number } | null; r?: { k: string; t: number } | null; uid?: string | null; j?: string | null; w?: boolean }> }
  | { type: "notice"; notice: { id: string; type: string; title: string; body: string | null; boothId: number | null; createdAt: number } }
  | { type: "friend"; kind: "request" | "accepted"; from: { id: string; name: string } }
  | { type: "team"; name: string; from: { id: string; name: string } }
  | { type: "chat"; message: { id: string; room: string; authorName: string; authorBoothId: number | null; body: string; createdAt: number; playerId?: string } }
  | { type: "dm"; message: { id: string; from: string; fromName: string; to: string; body: string; createdAt: number } }
  | { type: "stats"; totalSalesCents: number; totalViews: number; claimed: number };

type Listener = (m: LiveMessage) => void;

const g = globalThis as unknown as { __forevercomicconBus?: Set<Listener>; __forevercomicconWho?: Map<Listener, string> };
const listeners = (g.__forevercomicconBus ??= new Set<Listener>());
const who = (g.__forevercomicconWho ??= new Map<Listener, string>()); // listener → visitor id, for private delivery

/** Send only to the connections of these visitors (a person may have several tabs). */
export function publishTo(visitorIds: string[], m: LiveMessage) {
  const want = new Set(visitorIds);
  for (const l of listeners) { if (want.has(who.get(l) ?? "")) { try { l(m); } catch { /* ignore */ } } }
}

export function publish(m: LiveMessage) {
  for (const l of listeners) {
    try {
      l(m);
    } catch {
      /* ignore */
    }
  }
}

export function subscribe(l: Listener, visitorId?: string): () => void {
  listeners.add(l);
  if (visitorId) who.set(l, visitorId);
  broadcastPresence();
  return () => {
    listeners.delete(l);
    who.delete(l);
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
