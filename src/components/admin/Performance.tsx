"use client";
/** Frame-rate sessions captured from the hall: who ran what GPU, how it went, and a timeline per session. */
import { useEffect, useMemo, useRef, useState } from "react";
import { useJson, Pager, PageHead, Badge, DateTime, Empty, qs, useToast } from "./shared";
import { verdict, type PerfBucket, type PerfDevice } from "@/lib/hall/perf";
import type { PerfSummary } from "@/lib/perf";

interface Row { id: string; userId: string | null; email: string | null; label: string | null; url: string | null; device: PerfDevice; summary: PerfSummary; startedAt: number; updatedAt: number }
interface Resp { rows: Row[]; total: number; pages: number }
interface Detail { session: Row & { samples: PerfBucket[] }; report: string }

const fpsKind = (f: number) => (f >= 50 ? "ok" : f >= 30 ? "warn" : "bad");
const shortGpu = (g: string) => g.replace(/^ANGLE \((.*)\)$/, "$1").replace(/, OpenGL.*$|, D3D11.*$|, Direct3D.*$/i, "").replace(/\s*\(0x[0-9A-F]+\)/i, "").slice(0, 70);

export default function Performance({ initialId }: { initialId: string | null }) {
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState<string | null>(initialId);
  const list = useJson<Resp>(`/api/admin/perf?${qs({ page })}`);
  const detail = useJson<Detail>(sel ? `/api/admin/perf/${sel}` : null);
  const toast = useToast();
  useEffect(() => { if (!sel && list.data?.rows[0]) setSel(list.data.rows[0].id); }, [list.data, sel]);
  const copy = async (text: string) => { try { await navigator.clipboard.writeText(text); toast.ok("Copied"); } catch { toast.err("Copy failed"); } };
  const download = (name: string, text: string, type = "application/json") => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); };
  const rows = list.data?.rows ?? [];
  const agg = useMemo(() => {
    if (rows.length === 0) return null;
    const fps = rows.map((r) => r.summary.avgFps).filter((n) => n > 0);
    const slow = rows.filter((r) => r.summary.avgFps > 0 && r.summary.avgFps < 30).length;
    return { sessions: list.data?.total ?? rows.length, avgFps: fps.length ? Math.round(fps.reduce((a, b) => a + b, 0) / fps.length) : 0, slow, gpus: new Set(rows.map((r) => shortGpu(r.device.gpu))).size };
  }, [rows, list.data]);
  return (
    <>
      {toast.node}
      <PageHead title="Performance" sub="Frame-rate captures from people walking the hall. Each visit posts a 1-second sample every 10 s (GPU, fps, frame time, draw calls, quality tier). Players can turn it off or label their device from the gear menu in the hall; P shows the live overlay.">
        <button className="admBtn" onClick={list.reload}>Refresh</button>
        <a className="admBtn" href="/api/admin/perf?format=json" download>Export all (JSON)</a>
      </PageHead>
      {agg && (
        <div className="admGrid">
          <div className="admTile"><div className="admLabel">Sessions</div><div className="admTile__n">{agg.sessions}</div><div className="admTile__sub">captured so far</div></div>
          <div className="admTile" style={{ ["--c" as string]: agg.avgFps >= 50 ? "var(--heat-1)" : agg.avgFps >= 30 ? "var(--heat-7)" : "var(--heat-6)" }}><div className="admLabel">Average fps</div><div className="admTile__n">{agg.avgFps}</div><div className="admTile__sub">across this page of sessions</div></div>
          <div className="admTile" style={{ ["--c" as string]: agg.slow ? "var(--heat-6)" : "var(--heat-1)" }}><div className="admLabel">Under 30 fps</div><div className="admTile__n">{agg.slow}</div><div className="admTile__sub">sessions that averaged below 30</div></div>
          <div className="admTile"><div className="admLabel">Distinct GPUs</div><div className="admTile__n">{agg.gpus}</div><div className="admTile__sub">on this page</div></div>
        </div>
      )}
      <div className="admCard">
        {list.error && <div className="admNote admNote--err">{list.error}</div>}
        {list.data && rows.length === 0 && <Empty>No sessions yet. Walk the floor on the live site and come back; the first samples land after 10 seconds.</Empty>}
        {rows.length > 0 && (
          <div className="admTableWrap"><table className="admTable">
            <thead><tr><th>Started</th><th>Who</th><th>GPU</th><th>Screen</th><th className="num">Length</th><th className="num">Avg fps</th><th className="num">Min</th><th className="num">p95 ms</th><th className="num">CPU ms</th><th className="num">Calls</th><th>Quality</th><th>Mode</th></tr></thead>
            <tbody>{rows.map((r) => {
              const m = r.summary; const q = Object.entries(m.quality).sort((a, b) => b[1] - a[1])[0]?.[0];
              const walk = Math.round(((m.modes.w ?? 0) / Math.max(1, m.durationS)) * 100);
              return (
                <tr key={r.id} className={r.id === sel ? "sel" : ""} onClick={() => setSel(r.id)} style={{ cursor: "pointer" }}>
                  <td><DateTime value={r.startedAt} /><div className="admMuted admMono" style={{ fontSize: 11 }}>{r.id}</div></td>
                  <td>{r.email ? <a href={`/admin/users/${r.userId}`} onClick={(e) => e.stopPropagation()}>{r.email}</a> : <span className="admMuted">visitor</span>}{r.label && <div className="admMuted" style={{ fontSize: 11 }}>{r.label}</div>}</td>
                  <td title={r.device.gpu}>{shortGpu(r.device.gpu)}<div className="admMuted" style={{ fontSize: 11 }}>{r.device.cores} cores{r.device.memory ? ` · ${r.device.memory} GB` : ""}{r.device.touch ? " · touch" : ""}</div></td>
                  <td className="admMono">{r.device.viewport}<div className="admMuted" style={{ fontSize: 11 }}>dpr {r.device.dpr} → {m.dpr}</div></td>
                  <td className="num">{m.durationS}s</td>
                  <td className="num"><Badge kind={fpsKind(m.avgFps)}>{m.avgFps}</Badge></td>
                  <td className="num">{m.minFps}</td>
                  <td className="num">{m.p95ms}</td>
                  <td className="num">{m.avgCpu || "-"}</td>
                  <td className="num">{m.avgCalls}</td>
                  <td>{q === "h" ? "high" : q === "m" ? "medium" : q === "l" ? "low" : "-"}</td>
                  <td>{walk}% walk</td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
        {list.data && <Pager page={page} pages={list.data.pages} total={list.data.total} onPage={setPage} />}
      </div>
      {sel && (
        <div className="admCard">
          {detail.error && <div className="admNote admNote--err">{detail.error}</div>}
          {detail.data && <SessionDetail d={detail.data} onCopy={copy} onDownload={download} />}
        </div>
      )}
    </>
  );
}

function SessionDetail({ d, onCopy, onDownload }: { d: Detail; onCopy: (t: string) => void; onDownload: (n: string, t: string, type?: string) => void }) {
  const s = d.session; const m = s.summary;
  const [metric, setMetric] = useState<"f" | "p95" | "cpu" | "calls" | "tris">("f");
  const csv = () => { const cols = ["t", "f", "avg", "p95", "max", "cpu", "rend", "calls", "tris", "mode", "q", "npc", "dpr", "long"] as const; return [cols.join(","), ...s.samples.map((b) => cols.map((c) => b[c] ?? "").join(","))].join("\n"); };
  return (
    <>
      <div className="admCard__hd">
        <div>
          <div style={{ fontWeight: 700 }}>{s.label || (s.email ?? "Visitor")} · <span className="admMono">{s.id}</span></div>
          <div className="admMuted" style={{ fontSize: 12 }}><DateTime value={s.startedAt} /> · {m.durationS}s · {s.url}</div>
        </div>
        <div className="admRow">
          <button className="admBtn" onClick={() => onCopy(d.report)}>Copy report</button>
          <button className="admBtn" onClick={() => onDownload(`fcc-perf-${s.id}.json`, JSON.stringify(s, null, 2))}>JSON</button>
          <button className="admBtn" onClick={() => onDownload(`fcc-perf-${s.id}.csv`, csv(), "text/csv")}>CSV</button>
        </div>
      </div>
      <div className="admGrid">
        <div className="admTile" style={{ ["--c" as string]: m.avgFps >= 50 ? "var(--heat-1)" : m.avgFps >= 30 ? "var(--heat-7)" : "var(--heat-6)" }}><div className="admLabel">Average fps</div><div className="admTile__n">{m.avgFps}</div><div className="admTile__sub">min {m.minFps}</div></div>
        <div className="admTile"><div className="admLabel">Frame time p95</div><div className="admTile__n">{m.p95ms}<span style={{ fontSize: 14 }}> ms</span></div><div className="admTile__sub">worst {m.worstMs} ms · {m.longFrames} frames over 50 ms</div></div>
        <div className="admTile"><div className="admLabel">Draw calls</div><div className="admTile__n">{m.avgCalls}</div><div className="admTile__sub">max {m.maxCalls} · {m.avgTris.toLocaleString("en-US")} triangles avg</div></div>
        <div className="admTile" style={{ ["--c" as string]: "var(--heat-2)" }}><div className="admLabel">Main thread</div><div className="admTile__n">{m.avgCpu || "-"}<span style={{ fontSize: 14 }}> ms/frame</span></div><div className="admTile__sub">{m.avgRender ? `${m.avgRender} ms in render · ` : ""}{verdict(m.avgCpu, m.avgFps)}</div></div>
        <div className="admTile"><div className="admLabel">Quality tiers</div><div className="admTile__n" style={{ fontSize: 18 }}>{Object.entries(m.quality).map(([k, v]) => `${k === "h" ? "high" : k === "m" ? "medium" : "low"} ${Math.round((v / Math.max(1, m.durationS)) * 100)}%`).join(" · ") || "-"}</div><div className="admTile__sub">render dpr {m.dpr}</div></div>
      </div>
      <div className="admMuted" style={{ fontSize: 12 }}><b style={{ color: "var(--text)" }}>{s.device.gpu}</b> · {s.device.vendor} · {s.device.cores} cores · {s.device.memory ?? "?"} GB · screen {s.device.screen} · viewport {s.device.viewport} · dpr {s.device.dpr}{s.device.touch ? " · touch" : ""}<div style={{ fontSize: 11 }}>{s.device.ua}</div></div>
      <div className="admRow" style={{ gap: 6 }}>
        {([["f", "fps"], ["p95", "frame p95 ms"], ["cpu", "main thread ms"], ["calls", "draw calls"], ["tris", "triangles"]] as const).map(([k, l]) => <button key={k} className={`admBtn admBtn--sm${metric === k ? " admBtn--primary" : ""}`} onClick={() => setMetric(k)}>{l}</button>)}
      </div>
      <Timeline samples={s.samples} metric={metric} />
      <details><summary className="admMuted" style={{ cursor: "pointer", fontSize: 12 }}>Text report</summary><pre className="admMono" style={{ whiteSpace: "pre-wrap", fontSize: 11, marginTop: 8 }}>{d.report}</pre></details>
    </>
  );
}

/** One series over time with a hover crosshair. Quality-tier changes and map/walk switches show as faint bands under the line. */
function Timeline({ samples, metric }: { samples: PerfBucket[]; metric: "f" | "p95" | "cpu" | "calls" | "tris" }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = 900, H = 220, PL = 44, PR = 12, PT = 12, PB = 26;
  const n = samples.length;
  const maxT = Math.max(1, samples[n - 1]?.t ?? 1), minT = samples[0]?.t ?? 0;
  const val = (b: PerfBucket) => b[metric] ?? 0;
  const vals = samples.map(val);
  const maxV = Math.max(1, ...vals) * 1.08;
  const x = (t: number) => PL + ((t - minT) / Math.max(1, maxT - minT)) * (W - PL - PR);
  const y = (v: number) => PT + (1 - v / maxV) * (H - PT - PB);
  const path = samples.map((b, i) => `${i ? "L" : "M"}${x(b.t).toFixed(1)},${y(val(b)).toFixed(1)}`).join(" ");
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(maxV * f));
  // bands where the quality tier changed
  const bands: { from: number; to: number; q: string }[] = [];
  for (const b of samples) { const last = bands[bands.length - 1]; if (last && last.q === b.q) last.to = b.t; else bands.push({ from: b.t, to: b.t, q: b.q }); }
  const onMove = (e: React.MouseEvent) => {
    const r = ref.current?.getBoundingClientRect(); if (!r || n === 0) return;
    const px = ((e.clientX - r.left) / r.width) * W; const t = minT + ((px - PL) / (W - PL - PR)) * (maxT - minT);
    let best = 0; for (let i = 1; i < n; i++) if (Math.abs(samples[i].t - t) < Math.abs(samples[best].t - t)) best = i;
    setHover(best);
  };
  if (n === 0) return <Empty>No samples.</Empty>;
  const h = hover != null ? samples[hover] : null;
  const label = { f: "fps", p95: "ms", cpu: "ms", calls: "calls", tris: "tris" }[metric];
  return (
    <div ref={ref} style={{ position: "relative" }} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
        {bands.map((b, i) => <rect key={i} x={x(b.from)} y={PT} width={Math.max(1, x(b.to) - x(b.from))} height={H - PT - PB} fill={b.q === "h" ? "var(--heat-1)" : b.q === "m" ? "var(--heat-7)" : "var(--heat-6)"} opacity={0.07} />)}
        {ticks.map((v) => <g key={v}><line x1={PL} x2={W - PR} y1={y(v)} y2={y(v)} stroke="var(--rule)" strokeWidth={1} /><text x={PL - 6} y={y(v) + 4} textAnchor="end" fontSize={11} fill="var(--text-dim)" fontFamily="var(--font-mono)">{v.toLocaleString("en-US")}</text></g>)}
        {metric === "f" && <line x1={PL} x2={W - PR} y1={y(30)} y2={y(30)} stroke="var(--heat-6)" strokeWidth={1} strokeDasharray="4 4" opacity={0.6} />}
        {[0, 0.5, 1].map((f) => { const t = Math.round(minT + f * (maxT - minT)); return <text key={f} x={x(t)} y={H - 8} textAnchor={f === 0 ? "start" : f === 1 ? "end" : "middle"} fontSize={11} fill="var(--text-dim)" fontFamily="var(--font-mono)">{t}s</text>; })}
        <path d={path} fill="none" stroke="var(--heat-2)" strokeWidth={2} strokeLinejoin="round" />
        {h && <g><line x1={x(h.t)} x2={x(h.t)} y1={PT} y2={H - PB} stroke="var(--text-dim)" strokeWidth={1} /><circle cx={x(h.t)} cy={y(val(h))} r={4} fill="var(--heat-2)" stroke="var(--surface)" strokeWidth={2} /></g>}
      </svg>
      {h && (
        <div style={{ position: "absolute", left: `${(x(h.t) / W) * 100}%`, top: 0, transform: x(h.t) > W * 0.7 ? "translateX(-105%)" : "translateX(8px)", background: "var(--surface-2)", border: "1px solid var(--rule-strong)", padding: "6px 8px", fontSize: 11, fontFamily: "var(--font-mono)", pointerEvents: "none", whiteSpace: "nowrap" }}>
          <div>{h.t}s · <b>{val(h).toLocaleString("en-US")} {label}</b></div>
          <div className="admMuted">{h.f} fps · avg {h.avg} ms · p95 {h.p95} ms · max {h.max} ms{h.cpu != null ? ` · main thread ${h.cpu} ms (render ${h.rend ?? 0})` : ""}</div>
          <div className="admMuted">{h.calls} calls · {h.tris.toLocaleString("en-US")} tris · {h.q === "h" ? "high" : h.q === "m" ? "medium" : "low"} · {h.mode === "w" ? "walk" : "map"} · {h.npc} npcs · dpr {h.dpr}{h.long ? ` · ${h.long} long` : ""}</div>
        </div>
      )}
    </div>
  );
}
