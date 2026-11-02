"use client";
/**
 * Proximity voice: push-to-talk audio between people standing within a few feet of each other on the floor. Off until
 * the player turns it on in Settings; the microphone is only opened while walking, and it only sends while T (or the
 * HUD button) is held. Audio goes browser to browser over WebRTC; the server relays nothing but the handshake
 * (offer/answer/ICE) to the one person it is for. Both sides must have voice on: a client with it off answers every
 * offer with a "bye" so the other side stops trying for a while.
 */
import { useSyncExternalStore } from "react";
import { live } from "@/lib/hall/live";
import { api, useHall } from "@/lib/hall/store";
import type { LiveMessage } from "@/lib/realtime";

export type VoiceSignal = Extract<LiveMessage, { type: "voice" }>["signal"];
export interface VoicePeer { name: string; state: RTCPeerConnectionState; speaking: boolean; dist: number }
export const voice = {
  pref: false, // the Settings toggle (localStorage fcc_voice): the mic is asked for the next time the player walks
  enabled: false, // the mic is open and the peer manager runs
  talking: false,
  peers: new Map<string, VoicePeer>(),
  error: null as string | null,
  version: 0,
};
const PREF_KEY = "fcc_voice";
const RANGE = 14; // ft: a conversation starts inside this
const DROP = RANGE + 3; // ft: and ends only past this, so nobody flickers in and out at the edge
const FULL = 4; // ft: full volume up to here, fading to silence at RANGE
const MAX_PEERS = 4;
const RETRY_MS = 15_000; // after a bye or a failed handshake, leave them alone this long
const CONNECT_MS = 20_000; // a handshake that has not connected by then is abandoned
const STUN = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];

const listeners = new Set<() => void>();
function bump() { voice.version++; for (const l of listeners) l(); }
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export function useVoice() { useSyncExternalStore(subscribe, () => voice.version, () => 0); return voice; }
/** Whether that person is talking right now; each figure subscribes to its own boolean, so only it re-renders. */
export function useVoiceSpeaking(id: string): boolean { return useSyncExternalStore(subscribe, () => voice.peers.get(id)?.speaking ?? false, () => false); }

/** The walker's position, handed over by the hall (it lives in the avatar module). */
let local: { x: number; z: number } = { x: 0, z: 0 };
export function bindVoicePosition(p: { x: number; z: number }) { local = p; }

interface Conn { pc: RTCPeerConnection; audio: HTMLAudioElement; analyser: AnalyserNode | null; src: MediaStreamAudioSourceNode | null; buf: Uint8Array<ArrayBuffer> | null; queued: RTCIceCandidateInit[]; opened: number; loudUntil: number; lastSeen: number; dist: number }
const GRACE_MS = 5000; // someone missing from the roster this long (their stream reconnecting, a hiccup) is really gone
const conns = new Map<string, Conn>();
const declined = new Map<string, number>(); // id → when we may try them again
let stream: MediaStream | null = null;
let track: MediaStreamTrack | null = null;
let ctx: AudioContext | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let meter: ReturnType<typeof setInterval> | null = null;
let starting = false;

const dist = (p: { x: number; z: number }) => Math.hypot(p.x - local.x, p.z - local.z);
const volumeAt = (d: number) => Math.max(0, Math.min(1, (RANGE - d) / (RANGE - FULL)));
/** Glare rule: of any two people the one with the smaller id makes the offer, the other only answers. */
const isOfferer = (other: string) => live.me < other;

/** One request at a time per person, so an ICE candidate never overtakes the offer it belongs to. */
const sending = new Map<string, Promise<void>>();
function send(to: string, kind: VoiceSignal["kind"], data?: unknown): Promise<void> {
  // they may have just left, or we may be over the limit: the next tick retries anything that matters
  const next = (sending.get(to) ?? Promise.resolve()).then(() => api("/api/voice", { method: "POST", body: JSON.stringify({ to, kind, data }) })).then(() => {}, () => {});
  sending.set(to, next);
  return next;
}
/** Candidates that reach the answering side before the offer (the offer was refused for a moment, or is still on its way). */
const earlyIce = new Map<string, { cands: RTCIceCandidateInit[]; at: number }>();

function syncPeer(id: string) {
  const c = conns.get(id); if (!c) return;
  const p = live.players.get(id), prev = voice.peers.get(id);
  voice.peers.set(id, { name: p?.n ?? prev?.name ?? "Visitor", state: c.pc.connectionState, speaking: prev?.speaking ?? false, dist: c.dist });
  bump();
}

/** Remote audio is held in a hidden <audio>; a browser that wants a gesture first gets the play retried on the next one. */
function playSoon(audio: HTMLAudioElement) {
  audio.play().catch(() => {
    const again = () => { void audio.play().catch(() => {}); void ctx?.resume(); window.removeEventListener("pointerdown", again); window.removeEventListener("keydown", again); };
    window.addEventListener("pointerdown", again); window.addEventListener("keydown", again);
  });
}

function attachMeter(c: Conn, ms: MediaStream) {
  try {
    ctx ??= new AudioContext();
    void ctx.resume();
    c.src = ctx.createMediaStreamSource(ms);
    c.analyser = ctx.createAnalyser(); c.analyser.fftSize = 256;
    c.src.connect(c.analyser); // analysis only: not wired to the destination, the <audio> element does the playing
    c.buf = new Uint8Array(new ArrayBuffer(c.analyser.fftSize));
  } catch { c.analyser = null; }
}

function createConn(id: string): Conn {
  const pc = new RTCPeerConnection({ iceServers: STUN });
  const audio = document.createElement("audio");
  audio.autoplay = true; audio.setAttribute("playsinline", ""); audio.style.display = "none"; audio.dataset.voicePeer = id;
  document.body.appendChild(audio);
  const p = live.players.get(id);
  const c: Conn = { pc, audio, analyser: null, src: null, buf: null, queued: [], opened: Date.now(), loudUntil: 0, lastSeen: Date.now(), dist: p ? dist(p) : 0 };
  if (track && stream) pc.addTrack(track, stream);
  pc.onicecandidate = (e) => { if (e.candidate) void send(id, "ice", e.candidate.toJSON()); };
  pc.ontrack = (e) => { const ms = e.streams[0] ?? new MediaStream([e.track]); audio.srcObject = ms; playSoon(audio); attachMeter(c, ms); };
  pc.onconnectionstatechange = () => {
    syncPeer(id);
    if (pc.connectionState === "failed") { drop(id, true); declined.set(id, Date.now() + RETRY_MS); }
  };
  conns.set(id, c);
  syncPeer(id);
  return c;
}

function drop(id: string, sayBye: boolean) {
  const c = conns.get(id); if (!c) return;
  conns.delete(id);
  try { c.src?.disconnect(); } catch { /* already gone */ }
  try { c.pc.close(); } catch { /* already closed */ }
  c.audio.srcObject = null; c.audio.remove();
  if (sayBye) void send(id, "bye");
  if (voice.peers.delete(id)) bump();
}

async function offer(id: string, c: Conn) {
  try {
    await c.pc.setLocalDescription(await c.pc.createOffer({ offerToReceiveAudio: true }));
    await send(id, "offer", c.pc.localDescription?.toJSON());
  } catch { drop(id, false); }
}
async function flushIce(c: Conn) {
  const q = c.queued; c.queued = [];
  for (const cand of q) { try { await c.pc.addIceCandidate(cand); } catch { /* a stale candidate */ } }
}

/** A handshake message from the live stream, addressed to us. */
export function handleSignal(s: VoiceSignal) {
  if (!live.me || s.to !== live.me) return;
  const id = s.from;
  if (!voice.enabled) { if (s.kind === "offer") void send(id, "bye"); return; }
  if (s.kind === "bye") { drop(id, false); earlyIce.delete(id); declined.set(id, Date.now() + RETRY_MS); return; }
  void (async () => {
    try {
      if (s.kind === "offer") {
        if (isOfferer(id)) return; // our side makes the offers to them; theirs is a stale build or a race
        let c = conns.get(id);
        if (c && c.pc.signalingState !== "stable") { drop(id, false); c = undefined; } // a half-done handshake from before: start over
        c ??= createConn(id);
        const early = earlyIce.get(id); earlyIce.delete(id);
        if (early && Date.now() - early.at < CONNECT_MS) c.queued.push(...early.cands);
        await c.pc.setRemoteDescription(s.data as RTCSessionDescriptionInit);
        await flushIce(c);
        await c.pc.setLocalDescription(await c.pc.createAnswer());
        await send(id, "answer", c.pc.localDescription?.toJSON());
      } else if (s.kind === "answer") {
        const c = conns.get(id); if (!c || c.pc.signalingState !== "have-local-offer") return;
        await c.pc.setRemoteDescription(s.data as RTCSessionDescriptionInit);
        await flushIce(c);
      } else if (s.kind === "ice") {
        const cand = s.data as RTCIceCandidateInit;
        const c = conns.get(id);
        if (!c) {
          if (isOfferer(id)) return; // we closed that one; whatever is left of it can go
          const e = earlyIce.get(id) ?? { cands: [], at: Date.now() };
          if (e.cands.length < 50) e.cands.push(cand);
          earlyIce.set(id, e);
          return;
        }
        if (c.pc.remoteDescription) await c.pc.addIceCandidate(cand); else c.queued.push(cand);
      }
    } catch { drop(id, false); }
  })();
}

/** Once a second: who is close enough to talk to, who walked off, and how loud each of them should be. */
function tick() {
  if (!voice.enabled || !live.me) return;
  const now = Date.now();
  const here = new Map<string, number>(); // everyone on the roster (not away) → distance
  for (const p of live.players.values()) { if (p.id === live.me || p.w) continue; here.set(p.id, dist(p)); }
  // conversations we have, nearest first: kept while they are near (or only just missing), the furthest let go when over the cap
  const keep = new Set<string>();
  const have = Array.from(conns.entries()).map(([id, c]) => { const d = here.get(id); if (d !== undefined) { c.lastSeen = now; c.dist = d; } return { id, c }; }).sort((a, b) => a.c.dist - b.c.dist);
  for (const { id, c } of have) {
    const gone = !here.has(id) && now - c.lastSeen > GRACE_MS;
    if (gone || c.dist > DROP || keep.size >= MAX_PEERS) { drop(id, true); continue; }
    if (c.pc.connectionState !== "connected" && now - c.opened > CONNECT_MS) { drop(id, true); declined.set(id, now + RETRY_MS); continue; }
    keep.add(id);
    c.audio.volume = volumeAt(c.dist);
  }
  // new ones, nearest first, while there is room: only the side that makes the offers starts a conversation
  const fresh = Array.from(here.entries()).filter(([id, d]) => !conns.has(id) && d <= RANGE && isOfferer(id) && (declined.get(id) ?? 0) <= now).sort((a, b) => a[1] - b[1]);
  for (const [id] of fresh) { if (keep.size >= MAX_PEERS) break; keep.add(id); void offer(id, createConn(id)); }
  for (const id of conns.keys()) syncPeer(id);
}

/** The level the receiver itself reports (0..1): works before any click, when the AudioContext is still suspended. */
async function receiverLevel(pc: RTCPeerConnection): Promise<number> {
  let level = 0;
  const stats = await pc.getStats().catch(() => null);
  stats?.forEach((r) => { const s = r as { type: string; kind?: string; audioLevel?: number }; if (s.type === "inbound-rtp" && s.kind === "audio") level = Math.max(level, s.audioLevel ?? 0); });
  return level;
}
/** Several times a second: a cheap level read on each remote stream, so the HUD and the figure can show who is talking. */
let metering = false;
async function meterTick() {
  if (metering) return; // a slow getStats must not pile up
  metering = true;
  try {
    const now = Date.now();
    let changed = false;
    for (const [id, c] of conns) {
      const p = voice.peers.get(id); if (!p || c.pc.connectionState !== "connected") continue;
      let level = 0;
      if (c.analyser && c.buf && ctx?.state === "running") {
        c.analyser.getByteTimeDomainData(c.buf);
        let sum = 0; for (let i = 0; i < c.buf.length; i++) { const v = (c.buf[i] - 128) / 128; sum += v * v; }
        level = Math.sqrt(sum / c.buf.length);
      } else level = await receiverLevel(c.pc); // the browser keeps the AudioContext suspended until a click; the receiver's own meter does not wait
      if (level > 0.02) c.loudUntil = now + 350; // holds through the gaps between words
      const speaking = c.loudUntil > now && c.audio.volume > 0;
      if (speaking !== p.speaking) { p.speaking = speaking; changed = true; }
    }
    if (changed) bump();
  } finally { metering = false; }
}

/** Push-to-talk: the mic track is live only while this is true. */
export function setTalking(on: boolean) {
  if (!voice.enabled) on = false;
  if (track) track.enabled = on;
  if (voice.talking !== on) { voice.talking = on; bump(); }
}

const typing = (t: EventTarget | null) => { const el = t as HTMLElement | null; return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable); };
const onKeyDown = (e: KeyboardEvent) => {
  if ((e.key || "").toLowerCase() !== "t" || e.repeat || e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
  if (document.body.dataset.hall !== "1" || useHall.getState().mode !== "walk") return;
  setTalking(true);
};
const onKeyUp = (e: KeyboardEvent) => { if ((e.key || "").toLowerCase() === "t") setTalking(false); };
const release = () => setTalking(false);
const onHidden = () => { if (document.hidden) release(); };

function explain(e: unknown): string {
  const name = (e as { name?: string } | null)?.name ?? "";
  if (name === "NotAllowedError" || name === "SecurityError") return "Microphone blocked: allow it in the browser's site settings, then turn voice on again.";
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No microphone found.";
  if (name === "NotReadableError") return "The microphone is in use by another app.";
  return "Could not start the microphone.";
}

/** Opens the mic (muted) and starts looking for people nearby. Resolves true when voice is on. */
export async function enableVoice(): Promise<boolean> {
  if (voice.enabled || starting) return voice.enabled;
  if (typeof RTCPeerConnection === "undefined" || !navigator.mediaDevices?.getUserMedia) { voice.error = "This browser has no WebRTC or microphone support; text chat still works."; bump(); return false; }
  starting = true;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    track = stream.getAudioTracks()[0] ?? null;
    if (!track) throw Object.assign(new Error("no track"), { name: "NotFoundError" });
    track.enabled = false; // push-to-talk: silent until a key is held
    track.onended = () => { disableVoice(); voice.error = "The microphone went away."; bump(); };
    voice.enabled = true; voice.error = null; voice.talking = false;
    timer = setInterval(tick, 1000);
    meter = setInterval(() => { void meterTick(); }, 150);
    window.addEventListener("keydown", onKeyDown); window.addEventListener("keyup", onKeyUp); window.addEventListener("blur", release); document.addEventListener("visibilitychange", onHidden);
    bump();
    tick();
    return true;
  } catch (e) {
    for (const t of stream?.getTracks() ?? []) t.stop();
    stream = null; track = null;
    voice.error = explain(e); bump();
    return false;
  } finally { starting = false; }
}

/** Closes every conversation (telling each person), releases the mic and stops listening for T. */
export function disableVoice() {
  if (!voice.enabled) return;
  voice.enabled = false; voice.talking = false;
  if (timer) clearInterval(timer); if (meter) clearInterval(meter); timer = meter = null;
  window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); window.removeEventListener("blur", release); document.removeEventListener("visibilitychange", onHidden);
  for (const id of Array.from(conns.keys())) drop(id, true);
  earlyIce.clear();
  if (track) track.onended = null;
  for (const t of stream?.getTracks() ?? []) t.stop();
  stream = null; track = null;
  voice.peers.clear();
  bump();
}

/** The Settings toggle. On: ask for the mic now if walking (the click is the gesture the browser wants), else on the next walk. */
export function setVoicePref(on: boolean) {
  voice.pref = on; voice.error = null;
  try { localStorage.setItem(PREF_KEY, on ? "1" : "0"); } catch { /* storage off: the choice lasts this visit */ }
  bump();
  if (on) { if (useHall.getState().mode === "walk") void enableVoice(); }
  else disableVoice();
}

/** Call once from the hall: reads the saved choice and opens or releases the mic as the player enters and leaves walk mode. */
export function startVoiceTracking(): () => void {
  try { voice.pref = localStorage.getItem(PREF_KEY) === "1"; } catch { voice.pref = false; }
  bump();
  const apply = (mode: string) => { if (mode === "walk") { if (voice.pref && !voice.error) void enableVoice(); } else disableVoice(); };
  const unsub = useHall.subscribe((s, prev) => { if (s.mode !== prev.mode) apply(s.mode); });
  apply(useHall.getState().mode);
  if (process.env.NODE_ENV !== "production") (window as unknown as { __voice?: unknown }).__voice = { voice, conns, subscribe, enableVoice, disableVoice, setTalking, setVoicePref, get ctxState() { return ctx?.state ?? "none"; }, receiverLevel };
  return () => { unsub(); disableVoice(); };
}
