"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- leaving the hall is a full page load on purpose (see Hud.tsx) */
/** The guide inside the hall: the same sections as /help, searchable, one open at a time. */
import { useMemo, useState } from "react";
import { DOCS, docText } from "@/lib/docs";
import { DocBlocks } from "@/components/ui/DocBlocks";
import { PanelHeader } from "./common";

export function HelpPanel() {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const hits = useMemo(() => { const s = q.trim().toLowerCase(); return s ? DOCS.filter((d) => docText(d).includes(s)) : DOCS; }, [q]);
  const showTips = () => { try { localStorage.removeItem("fcc_tips"); } catch { /* storage off */ } location.reload(); };
  return (
    <>
      <PanelHeader title="Help" sub="Every feature of the floor, and how to use it" />
      <div className="space-y-2 p-3">
        <input className="input text-sm" placeholder="Search the guide… (e.g. coins, commission, voice)" value={q} onChange={(e) => { setQ(e.target.value); setOpen(null); }} />
        {hits.length === 0 && <p className="text-xs text-slate-400">Nothing for that. Try another word, or <a className="underline" href="/help">read the whole guide</a>.</p>}
        <ul className="space-y-1">
          {hits.map((d) => {
            const on = open === d.slug || (!!q && hits.length <= 2);
            return (
              <li key={d.slug} className="rounded-xl border border-white/10 bg-white/[0.04]">
                <button onClick={() => setOpen(on ? null : d.slug)} className="flex w-full items-start gap-2 px-3 py-2 text-left">
                  <span className="text-lg leading-none">{d.icon}</span>
                  <span className="min-w-0 flex-1"><span className="block text-sm font-semibold">{d.title}</span><span className="block text-[11px] text-slate-400">{d.summary}</span></span>
                  <span className="text-slate-500">{on ? "–" : "+"}</span>
                </button>
                {on && <div className="border-t border-white/8 px-3 py-2"><DocBlocks blocks={d.blocks} compact /><a href={`/help/${d.slug}`} className="mt-2 block text-[11px] text-slate-400 hover:text-white">Open this section as a page →</a></div>}
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap gap-2 pt-1 text-[11px]">
          <a href="/help" className="btn-ghost text-xs">The full guide</a>
          <button onClick={showTips} className="btn-ghost text-xs">Show the welcome card again</button>
        </div>
      </div>
    </>
  );
}
