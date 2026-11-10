/**
 * Pub/sub for the live feed. Every open stream (server-sent events or a WebSocket) is a listener in this process;
 * with REDIS_URL set, a message published on any pm2 worker is relayed to the listeners of every other worker, so
 * chat, private messages, booth changes and notices reach people whichever worker they are connected to. Without
 * Redis this is the single-process bus it always was.
 */
import { redis, redisSub, redisEnabled, WORKER_ID } from "@/lib/redis";
import type { LivePlayer } from "@/lib/presence";

/** A distant player, packed: id, name, x, z, heading, state, away (0/1), account id, title. */
export type FarPlayer = [string, string, number, number, number, number, 0 | 1, string | null, string | null];
/** A nearby player's movement, packed: id, x, z, heading, state, away (0/1), fresh emote, fresh reaction. */
export type MovePlayer = [string, number, number, number, number, 0 | 1, { n: string; t: number } | 0, { k: string; t: number } | 0];
export type LiveMessage =
  | { type: "event"; event: { id: string; type: string; boothId: number | null; title: string; detail: string | null; amountCents: number | null; createdAt: number } }
  | { type: "booth"; booth: { art?: Record<string, number>; artLinks?: Record<string, string>; house?: boolean; bannerHeight?: number; bookSlots?: number; logoVersion?: number; freeValueCents?: number; id: number; valueCents: number; name: string | null; color: string; accent: string; style: string; cloth: string; category: string; tier: string; hasLogo: boolean; tagline: string | null; website: string | null; artstation?: string | null; deviantart?: string | null; instagram?: string | null; xUrl?: string | null; facebook?: string | null; globalcomix?: string | null; size: string; kind: string; label: string; hall: string } }
  | { type: "presence"; online: number }
  | { type: "hello"; id: string } // the visitor id this stream is registered under
  /** The roster, per listener: nearby people in full when they are new to you or changed their look or name, their movement packed every tick, everyone else packed every couple of seconds, who left, and how many are on the floor. `reset` on the first message. */
  | { type: "players"; near?: Omit<LivePlayer, "t" | "sig">[]; move?: MovePlayer[]; far?: FarPlayer[]; gone?: string[]; total: number; reset?: boolean }
  | { type: "notice"; notice: { id: string; type: string; title: string; body: string | null; boothId: number | null; createdAt: number } }
  | { type: "friend"; kind: "request" | "accepted"; from: { id: string; name: string } }
  | { type: "team"; name: string; from: { id: string; name: string }; quiet?: boolean } // quiet: just refresh which booths I can sit at
  | { type: "chat"; message: { id: string; room: string; authorName: string; authorBoothId: number | null; body: string; createdAt: number; playerId?: string; authorUid?: string } }
  | { type: "dm"; message: { id: string; from: string; fromName: string; to: string; body: string; createdAt: number } }
  | { type: "voice"; signal: { from: string; to: string; kind: "offer" | "answer" | "ice" | "bye"; data?: unknown } } // a WebRTC handshake relayed to one person; the audio itself never touches the server
  | { type: "stats"; totalSalesCents: number; totalViews: number; claimed: number }
  /** The hall is full: where you stand in the line and roughly how long. `admitted` means walk in now (the ticket lasts a minute). */
  | { type: "queue"; position: number; ahead: number; etaSec: number; capacity: number; admitted?: boolean }
  | { type: "error"; code: string; message: string };

type Listener = (m: LiveMessage) => void;

const g = globalThis as unknown as { __forevercomicconBus?: Set<Listener>; __forevercomicconWho?: Map<Listener, string>; __forevercomicconUser?: Map<Listener, string>; __fccBusWired?: boolean };
const listeners = (g.__forevercomicconBus ??= new Set<Listener>());
const who = (g.__forevercomicconWho ??= new Map<Listener, string>()); // listener → visitor id, for private delivery
const whoUser = (g.__forevercomicconUser ??= new Map<Listener, string>()); // listener → signed-in account, for notices
/** The listeners of this worker with their visitor ids (the presence ticker builds a roster view per listener). */
export function listenersWithIds(): Array<[Listener, string]> { return Array.from(who.entries()); }
export function listenerCount(): number { return listeners.size; }

const CHANNEL = "fcc:bus";
type Envelope = { o: string; m: LiveMessage; ids?: string[]; uid?: string };
/** Hand a message to the right local listeners. */
function deliver(env: Envelope) {
  if (env.ids) { const want = new Set(env.ids); for (const l of listeners) { if (want.has(who.get(l) ?? "")) { try { l(env.m); } catch { /* ignore */ } } } return; }
  if (env.uid) { for (const l of listeners) { if (whoUser.get(l) === env.uid) { try { l(env.m); } catch { /* ignore */ } } } return; }
  for (const l of listeners) { try { l(env.m); } catch { /* ignore */ } }
}
/** Relay to the other workers (and start listening to them, once). */
function relay(env: Envelope) {
  const r = redis(); if (!r) return;
  wire();
  r.publish(CHANNEL, JSON.stringify(env)).catch(() => {});
}
function wire() {
  if (g.__fccBusWired) return; g.__fccBusWired = true;
  const s = redisSub(); if (!s) return;
  s.subscribe(CHANNEL).catch(() => {});
  s.on("message", (_ch: string, raw: string) => { try { const env = JSON.parse(raw) as Envelope; if (env.o !== WORKER_ID) deliver(env); } catch { /* ignore */ } });
}

/** Send to every open tab of a signed-in person, walking the floor or not. */
export function publishToUser(userId: string | null | undefined, m: LiveMessage) {
  if (!userId) return;
  const env = { o: WORKER_ID, m, uid: userId }; deliver(env); relay(env);
}
/** Send only to the connections of these visitors (a person may have several tabs). */
export function publishTo(visitorIds: string[], m: LiveMessage) {
  const env = { o: WORKER_ID, m, ids: visitorIds }; deliver(env); relay(env);
}
export function publish(m: LiveMessage) {
  const env = { o: WORKER_ID, m }; deliver(env); relay(env);
}

export function subscribe(l: Listener, visitorId?: string, userId?: string | null): () => void {
  listeners.add(l);
  if (visitorId) who.set(l, visitorId);
  if (userId) whoUser.set(l, userId);
  if (redisEnabled()) wire();
  broadcastPresence();
  return () => {
    listeners.delete(l);
    who.delete(l);
    whoUser.delete(l);
    broadcastPresence();
  };
}

/** People connected: this worker's streams, or across all workers when Redis holds each worker's count. */
let onlineAcross = 0;
export function onlineCount(): number { return Math.max(listeners.size, onlineAcross); }
let presenceTimer: NodeJS.Timeout | null = null;
function broadcastPresence() {
  if (presenceTimer) return;
  presenceTimer = setTimeout(() => {
    presenceTimer = null;
    void refreshOnline().then(() => publish({ type: "presence", online: onlineCount() }));
  }, 250);
}
/** Each worker writes its own stream count with a short life; the sum is the hall's online figure. */
export async function refreshOnline(): Promise<void> {
  const r = redis(); if (!r) return;
  try {
    await r.set(`fcc:online:${WORKER_ID}`, String(listeners.size), "EX", 20);
    const keys = await r.keys("fcc:online:*");
    const vals = keys.length ? await r.mget(keys) : [];
    onlineAcross = vals.reduce((a, v) => a + (Number(v) || 0), 0);
  } catch { /* redis down: this worker's own count stands */ }
}
