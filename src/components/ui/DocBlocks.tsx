import type { DocBlock } from "@/lib/docs";

/** **bold** in doc strings, nothing else: the docs are plain text with a little emphasis. */
export function Rich({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return <>{parts.map((p, i) => (p.startsWith("**") && p.endsWith("**") ? <b key={i} className="text-white">{p.slice(2, -2)}</b> : <span key={i}>{p}</span>))}</>;
}

/** One documentation section's blocks, in prose, steps, bullets and tables. Shared by the public guide and the Help panel. */
export function DocBlocks({ blocks, compact }: { blocks: DocBlock[]; compact?: boolean }) {
  const t = compact ? "text-[13px]" : "text-sm md:text-base";
  return (
    <div className={`space-y-3 ${t} text-slate-200`}>
      {blocks.map((b, i) => (
        <div key={i} className="space-y-1.5">
          {b.h && <h3 className={`${compact ? "text-[11px]" : "text-xs"} font-bold uppercase tracking-wider text-amber-300`}>{b.h}</h3>}
          {b.p && <p className="leading-relaxed"><Rich text={b.p} /></p>}
          {b.steps && <ol className="list-decimal space-y-1 pl-5">{b.steps.map((s, j) => <li key={j}><Rich text={s} /></li>)}</ol>}
          {b.bullets && <ul className="list-disc space-y-1 pl-5">{b.bullets.map((s, j) => <li key={j}><Rich text={s} /></li>)}</ul>}
          {b.table && (
            <div className="overflow-x-auto rounded-xl border border-white/10">
              <table className="w-full text-left text-[12px] md:text-[13px]">
                <thead className="bg-white/[0.04] text-[10px] uppercase tracking-wider text-slate-400"><tr>{b.table.head.map((h) => <th key={h} className="px-2 py-1.5 font-semibold">{h}</th>)}</tr></thead>
                <tbody>{b.table.rows.map((r, j) => <tr key={j} className="border-t border-white/8 align-top">{r.map((c, k) => <td key={k} className={`px-2 py-1.5 ${k === 0 ? "whitespace-nowrap font-semibold text-white" : ""}`}><Rich text={c} /></td>)}</tr>)}</tbody>
              </table>
            </div>
          )}
          {b.tip && <p className="rounded-lg border border-amber-300/30 bg-amber-300/10 px-3 py-2 text-[12px]">💡 <Rich text={b.tip} /></p>}
        </div>
      ))}
    </div>
  );
}
