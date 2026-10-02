export function Sparkline({ values, color = "#ffcf5c", height = 36, width = 160 }: { values: number[]; color?: string; height?: number; width?: number }) {
  if (!values.length) return null;
  const max = Math.max(1, ...values);
  const step = width / Math.max(1, values.length - 1);
  const pts = values.map((v, i) => `${i * step},${height - (v / max) * (height - 4) - 2}`);
  const area = `0,${height} ${pts.join(" ")} ${width},${height}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block" aria-hidden>
      <polygon points={area} fill={color} opacity={0.12} />
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function Bars({ rows, height = 120, color = "#ffcf5c", labelEvery = 7 }: { rows: Array<{ day: string; value: number }>; height?: number; color?: string; labelEvery?: number }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="w-full">
      <div className="flex items-end gap-[2px]" style={{ height }}>
        {rows.map((r) => (
          <div key={r.day} className="group relative flex-1 min-w-0">
            <div className="w-full rounded-t-sm transition-all" style={{ height: Math.max(2, (r.value / max) * (height - 8)), background: color, opacity: 0.85 }} />
            <div className="pointer-events-none absolute -top-7 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-slate-900 px-1.5 py-0.5 text-[10px] text-white group-hover:block">
              {r.day.slice(5)} · {r.value.toLocaleString()}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-slate-500 mono">
        {rows.filter((_, i) => i % labelEvery === 0).map((r) => <span key={r.day}>{r.day.slice(5)}</span>)}
      </div>
    </div>
  );
}
