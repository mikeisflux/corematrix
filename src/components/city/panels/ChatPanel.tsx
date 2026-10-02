"use client";
import { useEffect, useRef, useState } from "react";
import { api, useCity } from "@/lib/city/store";
import { timeAgo } from "@/lib/util";
import { PanelHeader, SignIn } from "./common";

interface Msg { id: string; room: string; authorName: string; authorPlotId: number | null; body: string; createdAt: number }

export function ChatPanel({ room = "lobby", title = "Avenue chat" }: { room?: string; title?: string }) {
  const me = useCity((s) => s.me);
  const stats = useCity((s) => s.stats);
  const select = useCity((s) => s.select);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<{ messages: Msg[] }>(`/api/chat?room=${room}`).then((d) => setMsgs(d.messages));
    const es = new EventSource("/api/live");
    es.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.type === "chat" && m.message.room === room) setMsgs((x) => [...x.filter((y) => y.id !== m.message.id), m.message].slice(-80));
    };
    return () => es.close();
  }, [room]);
  useEffect(() => bottom.current?.scrollIntoView({ block: "end" }), [msgs]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setErr(null);
    try {
      await api("/api/chat", { method: "POST", body: JSON.stringify({ room, body: text.trim() }) });
      setText("");
    } catch (er) {
      setErr((er as Error).message);
    }
  };

  return (
    <>
      <PanelHeader title={title} sub={`${stats?.online ?? 1} online · owners can post links, visitors can't`} />
      <div className="max-h-[50vh] space-y-1.5 overflow-y-auto scroll p-3">
        {msgs.length === 0 && <p className="text-xs text-slate-400">Quiet right now. Say hi.</p>}
        {msgs.map((m) => (
          <div key={m.id} className="rounded-xl bg-white/[0.04] px-3 py-2 text-sm">
            <div className="flex items-center gap-2 text-[11px]">
              {m.authorPlotId ? (
                <button onClick={() => select(m.authorPlotId!)} className="font-semibold text-amber-300 hover:underline">{m.authorName}</button>
              ) : (
                <span className="font-semibold text-slate-300">{m.authorName}</span>
              )}
              {m.authorPlotId && <span className="text-slate-500">#{m.authorPlotId}</span>}
              <span className="ml-auto text-slate-500 mono">{timeAgo(m.createdAt)}</span>
            </div>
            <div className="break-words text-slate-100">{m.body}</div>
          </div>
        ))}
        <div ref={bottom} />
      </div>
      <div className="border-t border-white/8 p-3">
        {me ? (
          <form onSubmit={send} className="flex gap-2">
            <input className="input" maxLength={400} placeholder="Message the avenue…" value={text} onChange={(e) => setText(e.target.value)} />
            <button className="btn-primary">Send</button>
          </form>
        ) : (
          <SignIn note="Sign in to join the conversation." />
        )}
        {err && <p className="mt-1 text-xs text-rose-400">{err}</p>}
      </div>
    </>
  );
}
