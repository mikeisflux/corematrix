"use client";
/**
 * The always-open chat box, bottom left on a computer, like the chat of an online game: three tabs (Hall for everyone
 * on the floor, Friends for a room only your friends see, Whisper for private messages), a short translucent log and
 * one input line. Enter focuses it from anywhere, Enter sends, Esc goes back to walking. ▾ shrinks it to one line.
 * Phones keep the rail buttons instead: this box is hidden under the md breakpoint.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { api, useHall } from "@/lib/hall/store";
import { live } from "@/lib/hall/live";
import { social, useSocial, guestName, bumpSocial } from "@/lib/hall/social";
import { loadRoom, useRoom, forgetRoom } from "@/lib/hall/chat-rooms";
import { getPrefs, setPrefs, usePrefs } from "@/lib/hall/prefs";
import type { DmMessage } from "@/lib/dm";

type Tab = "hall" | "friends" | "whisper";
const TABS: { id: Tab; label: string }[] = [{ id: "hall", label: "Hall" }, { id: "friends", label: "Friends" }, { id: "whisper", label: "Whisper" }];
const typing = (t: EventTarget | null) => { const el = t as HTMLElement | null; return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable); };

/** Open a private thread in the box (not the panel): sets the active person and pulls the thread. */
function pickWhisper(id: string, name: string) {
  social.dm.active = { id, name }; social.dm.messages = [];
  const th = social.dm.threads.find((t) => t.with === id); if (th) { th.unread = 0; social.dm.unread = social.dm.threads.reduce((a, t) => a + t.unread, 0); }
  bumpSocial();
  api<{ me: string; messages: DmMessage[] }>(`/api/dm?with=${encodeURIComponent(id)}`).then((d) => { if (social.dm.active?.id !== id) return; social.dm.me = d.me; social.dm.messages = d.messages; bumpSocial(); }).catch(() => {});
}

export function ChatDock() {
  const prefs = usePrefs();
  const me = useHall((s) => s.me);
  const panel = useHall((s) => s.panel);
  const setPanel = useHall((s) => s.setPanel);
  const select = useHall((s) => s.select);
  const blocked = useHall((s) => s.blocked);
  const soc = useSocial();
  const [tab, setTab] = useState<Tab>("hall");
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const wantFocus = useRef(false); // Enter pressed while the box was shrunk: focus once the input is back on screen
  const input = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const min = prefs.chatDock === "min";
  const hall = useRoom("lobby");
  const friends = useRoom("friends");
  // unread counts per tab: lines that arrived while that tab was not the one on screen (or the box was shrunk)
  const seen = useRef<Record<Tab, number>>({ hall: 0, friends: 0, whisper: 0 });
  const [, tick] = useState(0);
  useEffect(() => { loadRoom("lobby"); }, []);
  useEffect(() => { forgetRoom("friends"); if (me) loadRoom("friends"); }, [me?.id, soc.friendsVersion]); // eslint-disable-line react-hooks/exhaustive-deps
  // my threads, so Whisper can list who I've talked with
  useEffect(() => { if (social.dm.threads.length) return; api<{ me: string; threads: typeof social.dm.threads }>("/api/dm").then((d) => { social.dm.me = d.me; social.dm.threads = d.threads; social.dm.unread = d.threads.reduce((a, t) => a + t.unread, 0); bumpSocial(); }).catch(() => {}); }, []);
  const isBlocked = (m: { authorUid?: string; playerId?: string }) => !!((m.authorUid && blocked.uids.has(m.authorUid)) || (m.playerId && blocked.pids.has(m.playerId)));
  const lines = tab === "hall" ? hall.filter((m) => !isBlocked(m)) : tab === "friends" ? friends : [];
  const counts = { hall: hall.length, friends: friends.length, whisper: 0 };
  useEffect(() => { if (!min) seen.current[tab] = counts[tab]; tick((n) => n + 1); }, [tab, min, counts.hall, counts.friends]); // eslint-disable-line react-hooks/exhaustive-deps
  const unread = (t: Tab) => (t === "whisper" ? soc.dm.unread : Math.max(0, counts[t] - seen.current[t]));
  // stick to the bottom (the newest line) unless the reader scrolled up; a tab change or (re)opening re-sticks, so the
  // box opens on the latest messages rather than the oldest
  const stuck = useRef(true);
  useEffect(() => { stuck.current = true; }, [tab, min]);
  useEffect(() => { const el = log.current; if (!el) return; if (stuck.current) el.scrollTop = el.scrollHeight; }, [lines.length, soc.dm.messages.length, tab, min]);
  const onLogScroll = () => { const el = log.current; if (el) stuck.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; };
  // Enter from the floor focuses the box (and opens it); Esc inside it goes back to walking
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || typing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (["chat", "dm"].includes(useHall.getState().panel)) return; // the big panel has its own input
      if (getPrefs().chatDock === "off") return;
      e.preventDefault();
      if (getPrefs().chatDock === "min") { wantFocus.current = true; setPrefs({ chatDock: "open" }); }
      else input.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => { if (!min && wantFocus.current) { wantFocus.current = false; input.current?.focus(); } }, [min]);
  const whisperTo = soc.dm.active;
  const people = useMemo(() => {
    const seenIds = new Set<string>(); const out: { id: string; name: string; here: boolean; unread: number }[] = [];
    for (const t of soc.dm.threads) { seenIds.add(t.with); out.push({ id: t.with, name: live.players.get(t.with)?.n ?? t.name, here: live.players.has(t.with), unread: t.unread }); }
    for (const p of live.players.values()) if (!seenIds.has(p.id) && p.id !== live.me) out.push({ id: p.id, name: p.n, here: true, unread: 0 });
    return out.slice(0, 40);
  }, [soc.version, soc.dm.threads.length, tab]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim(); if (!body) return;
    setErr(null);
    try {
      if (tab === "whisper") { if (!whisperTo) throw new Error("Pick who to whisper to"); await api("/api/dm", { method: "POST", body: JSON.stringify({ to: whisperTo.id, body, name: guestName() || undefined }) }); }
      else await api("/api/chat", { method: "POST", body: JSON.stringify({ room: tab === "hall" ? "lobby" : "friends", body }) });
      setText("");
    } catch (er) { setErr((er as Error).message); }
  };
  if (prefs.chatDock === "off" || panel === "chat" || panel === "dm") return null; // the full panel is the same thing, bigger
  const placeholder = tab === "hall" ? "Message the hall… (Enter to send, Esc to walk)" : tab === "friends" ? "Message your friends…" : whisperTo ? `Whisper to ${whisperTo.name}…` : "Pick someone above…";
  const needsAccount = tab !== "whisper" && !me;
  return (
    <div data-chat-dock className={`pointer-events-auto absolute bottom-14 left-3 hidden w-[380px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-xl border border-white/10 text-[12px] shadow-lg backdrop-blur-sm md:flex ${focused ? "bg-slate-950/80" : "bg-slate-950/55"}`}>
      <div className="flex items-center gap-0.5 border-b border-white/10 px-1 pt-1">
        {TABS.map((t) => { const n = unread(t.id); return (
          <button key={t.id} onClick={() => { setTab(t.id); if (min) setPrefs({ chatDock: "open" }); }} className={`relative rounded-t-lg px-3 py-1 text-[11px] font-semibold uppercase tracking-wider ${tab === t.id && !min ? "bg-white/10 text-amber-300" : "text-slate-400 hover:text-white"}`}>
            {t.label}{n > 0 && <span className="ml-1 rounded-full bg-rose-500 px-1 text-[9px] text-white">{n}</span>}
          </button>
        ); })}
        <span className="ml-auto" />
        <button title={min ? "Open the chat box" : "Shrink to one line"} onClick={() => setPrefs({ chatDock: min ? "open" : "min" })} className="rounded px-2 py-0.5 text-slate-400 hover:bg-white/10 hover:text-white">{min ? "▴" : "▾"}</button>
        <button title="Open the big chat panel" onClick={() => setPanel(tab === "whisper" ? (whisperTo ? "dm" : "people") : "chat")} className="rounded px-2 py-0.5 text-slate-400 hover:bg-white/10 hover:text-white">⤢</button>
      </div>
      {!min && (
        <>
          {tab === "whisper" && (
            <div className="flex items-center gap-1 border-b border-white/10 px-2 py-1 text-[11px]">
              <span className="text-slate-400">To</span>
              <select value={whisperTo?.id ?? ""} onChange={(e) => { const p = people.find((x) => x.id === e.target.value); if (p) pickWhisper(p.id, p.name); }} className="min-w-0 flex-1 rounded bg-white/10 px-1.5 py-0.5 text-slate-100">
                <option value="" disabled>{people.length ? "Pick someone" : "Nobody else on the floor yet"}</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.name}{p.here ? "" : " (away)"}{p.unread ? ` · ${p.unread} new` : ""}</option>)}
              </select>
            </div>
          )}
          <div ref={log} onScroll={onLogScroll} className="h-[8.5rem] space-y-0.5 overflow-y-auto scroll px-2 py-1.5 leading-snug">
            {tab !== "whisper" && lines.length === 0 && <p className="text-slate-500">{tab === "hall" ? "Quiet right now. Say hi." : me ? "Only your friends see this room. Nothing here yet." : "Sign in to chat with your friends."}</p>}
            {tab !== "whisper" && lines.map((m) => (
              <div key={m.id} className="break-words">
                {m.authorBoothId
                  ? <button onClick={() => select(m.authorBoothId!)} className="font-semibold text-amber-300 hover:underline">[{m.authorName}]</button>
                  : <span className="font-semibold text-sky-300">[{m.authorName}]</span>}
                <span className="text-slate-100"> {m.body}</span>
              </div>
            ))}
            {tab === "whisper" && !whisperTo && <p className="text-slate-500">Private messages, only the two of you. Pick a person above, or 💬 next to anyone in People.</p>}
            {tab === "whisper" && whisperTo && soc.dm.messages.length === 0 && <p className="text-slate-500">Say hi. Only {whisperTo.name} sees this.</p>}
            {tab === "whisper" && whisperTo && soc.dm.messages.map((m) => (
              <div key={m.id} className="break-words"><span className={`font-semibold ${m.from === soc.dm.me ? "text-amber-200" : "text-fuchsia-300"}`}>[{m.from === soc.dm.me ? "you" : m.fromName}]</span><span className="text-slate-100"> {m.body}</span></div>
            ))}
          </div>
          {needsAccount ? (
            <button onClick={() => setPanel("me")} className="border-t border-white/10 px-2 py-1.5 text-left text-[11px] text-amber-200 hover:bg-white/5">Sign in (free) to chat →</button>
          ) : (
            <form onSubmit={send} className="flex items-center gap-1 border-t border-white/10 p-1">
              <input ref={input} value={text} onChange={(e) => setText(e.target.value)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} onKeyDown={(e) => { if (e.key === "Escape") { e.currentTarget.blur(); } e.stopPropagation(); }} maxLength={tab === "whisper" ? 300 : 400} placeholder={placeholder} className="min-w-0 flex-1 rounded-lg bg-white/5 px-2 py-1 text-[12px] text-slate-100 placeholder:text-slate-500 focus:bg-white/10 focus:outline-none" />
              <button className="rounded-lg bg-amber-300 px-2.5 py-1 text-[11px] font-bold text-slate-900 disabled:opacity-40" disabled={!text.trim()}>Send</button>
            </form>
          )}
          {err && <p className="px-2 pb-1 text-[11px] text-rose-300">{err}</p>}
        </>
      )}
    </div>
  );
}
