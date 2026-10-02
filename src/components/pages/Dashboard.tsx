"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/city/store";
import { BUILDING_SHAPES, BUILDING_STYLES, DISTRICTS, formatCount, formatMoney, ROOF_STYLES, splitTakeover, TIERS } from "@/lib/config";
import { Bars } from "@/components/ui/Sparkline";
import { timeAgo } from "@/lib/util";

interface Me { id: string; email: string; displayName: string | null; coins: number; streak: number; creditCents: number; referralCode: string; isAdmin: boolean }
interface MyPlot { id: number; name: string | null; valueCents: number; tier: string; color: string }
interface Detail {
  plot: { id: number; name: string; tagline: string | null; description: string | null; website: string | null; logoUrl: string | null; color: string; accent: string; style: string; shape: string; roof: string; district: string; tier: string; tierUntil: number | null; valueCents: number; floors: number; totalViews: number; totalClicks: number; totalImpressions: number; claimedAt: number | null; salesCount: number; isOwner: boolean };
  series: Array<{ day: string; impressions: number; hovers: number; views: number; clicks: number; uniques: number; conversions?: number; conversionValueCents?: number }>;
  totals: { impressions: number; views: number; clicks: number; uniques: number };
  referrers: Array<{ source: string; views: number; clicks: number }>;
  history: Array<{ id: string; kind: string; amountCents: number; valueAfter: number; createdAt: number; sellerPayoutCents: number }>;
}

export function Dashboard({ initialPlot }: { initialPlot: number | null }) {
  const [me, setMe] = useState<Me | null>(null);
  const [plots, setPlots] = useState<MyPlot[]>([]);
  const [sel, setSel] = useState<number | null>(initialPlot);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [range, setRange] = useState<7 | 30 | 90>(30);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = await api<{ user: Me; plots: MyPlot[] }>("/api/me");
    setMe(d.user);
    setPlots(d.plots);
    if (!sel && d.plots[0]) setSel(d.plots[0].id);
  }, [sel]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!sel) return;
    api<Detail>(`/api/plot/${sel}`).then(setDetail).catch(() => setDetail(null));
  }, [sel]);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const series = useMemo(() => (detail ? detail.series.slice(-range) : []), [detail, range]);
  const sums = useMemo(() => series.reduce((a, r) => ({ impressions: a.impressions + r.impressions, views: a.views + r.views, clicks: a.clicks + r.clicks, uniques: a.uniques + r.uniques, conversions: a.conversions + (r.conversions ?? 0), value: a.value + (r.conversionValueCents ?? 0) }), { impressions: 0, views: 0, clicks: 0, uniques: 0, conversions: 0, value: 0 }), [series]);
  const prev = useMemo(() => {
    if (!detail) return null;
    const p = detail.series.slice(-range * 2, -range);
    return p.reduce((a, r) => ({ views: a.views + r.views, clicks: a.clicks + r.clicks }), { views: 0, clicks: 0 });
  }, [detail, range]);
  const delta = (cur: number, before: number) => (before === 0 ? (cur ? "new" : "–") : `${cur >= before ? "+" : ""}${Math.round(((cur - before) / before) * 100)}%`);

  if (!me) return <p className="text-slate-400">Loading…</p>;

  if (plots.length === 0) {
    return (
      <div className="mx-auto max-w-xl text-center">
        <h1 className="text-3xl font-bold">You don't own a building yet</h1>
        <p className="mt-2 text-slate-300">Claim a plot from $5. You'll get a permanent address, your logo on the skyline, and daily numbers on who saw it and who clicked.</p>
        <Link href="/?claim=1" className="btn-primary mt-6">Claim a plot →</Link>
        <div className="mt-8 rounded-2xl border border-white/10 p-4 text-left text-sm">
          <div className="font-bold">Your balances</div>
          <div className="mt-1 text-slate-300">{me.coins} arcade coins · {formatMoney(me.creditCents)} credit (spendable on any claim or takeover)</div>
          <div className="mt-2 text-xs text-slate-500">Referral link: <span className="mono">{origin}/?ref={me.referralCode}</span></div>
        </div>
      </div>
    );
  }

  const p = detail?.plot;
  const takeover = p ? splitTakeover(p.valueCents) : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <aside className="space-y-3">
        <div className="rounded-2xl border border-white/10 p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Your balances</div>
          <div className="mt-1 flex items-baseline gap-3"><span className="mono text-2xl font-bold text-amber-300">{me.coins}</span><span className="text-xs text-slate-400">coins · {me.streak}-day streak</span></div>
          <div className="mono text-lg">{formatMoney(me.creditCents)} <span className="text-xs text-slate-400">credit</span></div>
          <p className="mt-1 text-[11px] text-slate-500">Credit comes from takeover payouts and referrals. Spend it on any claim, takeover, boost or billboard. Payouts to your bank: email us (Stripe Connect coming).</p>
        </div>
        <div className="rounded-2xl border border-white/10 p-2">
          <div className="px-2 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">Your buildings</div>
          {plots.map((b) => (
            <button key={b.id} onClick={() => setSel(b.id)} className={`flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left ${sel === b.id ? "bg-amber-300/15" : "hover:bg-white/5"}`}>
              <span className="h-8 w-8 shrink-0 rounded-lg" style={{ background: b.color }} />
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{b.name}</span><span className="block text-[11px] text-slate-400">#{b.id} · {formatMoney(b.valueCents)} · {b.tier}</span></span>
            </button>
          ))}
          <Link href="/?claim=1" className="btn-ghost mt-1 w-full text-xs">+ Claim another plot</Link>
        </div>
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4 text-xs">
          <b>Refer a friend.</b> You both get $2 credit and 25 coins when they claim.
          <input readOnly className="input mt-2 text-[11px]" value={`${origin}/?ref=${me.referralCode}`} onFocus={(e) => e.target.select()} />
        </div>
      </aside>

      {p && detail ? (
        <section className="space-y-6">
          <Checklist p={p} />
          <div className="flex flex-wrap items-center gap-3">
            <img src={`/api/logo/${p.id}`} alt="" className="h-14 w-14 rounded-xl bg-white/10 object-cover" />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-2xl font-bold">{p.name}</h1>
              <div className="text-xs text-slate-400">Plot #{p.id} · {DISTRICTS[p.district]?.name} · {p.floors} floors · {p.tier !== "free" ? `${TIERS[p.tier as keyof typeof TIERS].name} until ${new Date(p.tierUntil ?? 0).toLocaleDateString()}` : "Owner plan"}</div>
            </div>
            <Link href={`/plot/${p.id}`} className="btn-ghost text-xs">Public page</Link>
            <Link href={`/?plot=${p.id}`} className="btn-ghost text-xs">View on skyline</Link>
            <div className="flex rounded-xl bg-white/5 p-0.5">{([7, 30, 90] as const).map((r) => <button key={r} onClick={() => setRange(r)} className={`rounded-lg px-3 py-1 text-xs ${range === r ? "bg-amber-300 text-slate-950 font-semibold" : ""}`}>{r}d</button>)}</div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
            <K label="Impressions" v={formatCount(sums.impressions)} sub="seen on the skyline" />
            <K label="Unique visitors" v={formatCount(sums.uniques)} />
            <K label="Building views" v={formatCount(sums.views)} sub={prev ? `${delta(sums.views, prev.views)} vs prior` : undefined} />
            <K label="Website clicks" v={formatCount(sums.clicks)} sub={prev ? `${delta(sums.clicks, prev.clicks)} vs prior` : undefined} accent />
            <K label="CTR" v={`${sums.views ? ((sums.clicks / sums.views) * 100).toFixed(1) : "0.0"}%`} sub="clicks ÷ views" />
            <K label="Conversions" v={String(sums.conversions)} sub={sums.value ? `${formatMoney(sums.value)} reported` : "add the pixel ↓"} />
          </div>

          <div className="grid gap-4 md:grid-cols-[1fr_280px]">
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="mb-2 text-xs text-slate-400">Views (amber) and clicks (teal), last {range} days</div>
              <Bars rows={series.map((r) => ({ day: r.day, value: r.views }))} color="#ffcf5c" labelEvery={range > 30 ? 15 : 7} />
              <div className="mt-2"><Bars rows={series.map((r) => ({ day: r.day, value: r.clicks }))} color="#5ee6c3" height={60} labelEvery={range > 30 ? 15 : 7} /></div>
              {p.tier === "free" && range > 30 && <p className="mt-2 text-xs text-amber-300">Owner plan keeps 30 days of history. Pro keeps 90 and adds referrers.</p>}
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-xs text-slate-400">Where clicks come from</div>
              {detail.referrers.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">No referrer data yet{p.tier === "free" ? " (Pro feature)" : ""}.</p>
              ) : (
                <ul className="mt-2 space-y-1 text-sm">
                  {detail.referrers.map((r) => {
                    const max = Math.max(1, ...detail.referrers.map((x) => x.clicks));
                    return (
                      <li key={r.source}>
                        <div className="flex justify-between text-xs"><span className="capitalize">{r.source}</span><span className="mono">{r.clicks} clicks · {r.views} views</span></div>
                        <div className="mt-0.5 h-1.5 rounded bg-white/5"><div className="h-full rounded bg-amber-300" style={{ width: `${(r.clicks / max) * 100}%` }} /></div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Grow p={p} me={me} onDone={() => { void load(); api<Detail>(`/api/plot/${p.id}`).then(setDetail); }} setMsg={setMsg} />
            <Protect p={p} takeover={takeover!} setMsg={setMsg} />
          </div>

          <Edit p={p} onSaved={(d) => { setDetail({ ...detail, plot: { ...detail.plot, ...d } }); setMsg("Saved. The skyline updates instantly."); }} setMsg={setMsg} />

          <div className="grid gap-4 md:grid-cols-2">
            <Code title="Conversion pixel" blurb="Put this on your thank-you / signup success page. Pass the order value in cents with ?v= to see revenue next to clicks." code={`<img src="${origin}/api/px/${p.id}?v=0" width="1" height="1" alt="" />`} />
            <Code title="Badge for your site" blurb="Links back to your building. Clicks count as referrals and raise your trending score." code={`<a href="${origin}/plot/${p.id}?src=embed"><img src="${origin}/embed/${p.id}" alt="${p.name} on the skyline" width="320" height="64" /></a>`} />
          </div>

          {detail.history.length > 0 && (
            <div className="rounded-2xl border border-white/10 p-4">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Transactions on this plot</div>
              <ul className="mt-2 divide-y divide-white/8 text-sm">
                {detail.history.slice().reverse().map((h) => (
                  <li key={h.id} className="flex items-center justify-between py-2"><span className="capitalize">{h.kind}{h.kind === "takeover" && h.sellerPayoutCents ? <span className="text-slate-500"> · seller received {formatMoney(h.sellerPayoutCents)}</span> : null}</span><span className="mono">{formatMoney(h.amountCents)} → value {formatMoney(h.valueAfter)}<span className="ml-2 text-slate-500">{timeAgo(h.createdAt)}</span></span></li>
                ))}
              </ul>
            </div>
          )}
          {msg && <div className="fixed bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-emerald-400 px-4 py-2 text-sm font-semibold text-slate-950 shadow-xl" onAnimationEnd={() => setMsg(null)}>{msg}</div>}
        </section>
      ) : (
        <p className="text-slate-400">Loading building…</p>
      )}
    </div>
  );
}

function K({ label, v, sub, accent }: { label: string; v: string; sub?: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`mono text-xl font-bold ${accent ? "text-amber-300" : ""}`}>{v}</div>
      {sub && <div className="text-[11px] text-slate-400">{sub}</div>}
    </div>
  );
}

function Checklist({ p }: { p: Detail["plot"] }) {
  const items = [
    { ok: !!p.logoUrl, label: "Upload a real logo (initials are the fallback)" },
    { ok: !!p.website, label: "Add your website link" },
    { ok: !!p.tagline, label: "Write a one-line tagline" },
    { ok: p.totalClicks > 0, label: "Get your first website click" },
    { ok: p.totalViews >= 50, label: "Reach 50 building views (share your card on X)" },
  ];
  const done = items.filter((i) => i.ok).length;
  if (done === items.length) return null;
  return (
    <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4">
      <div className="flex items-center justify-between"><div className="font-bold">Get the most from your building · {done}/{items.length}</div></div>
      <ul className="mt-2 grid gap-1 text-sm md:grid-cols-2">
        {items.map((i) => <li key={i.label} className={i.ok ? "text-slate-500 line-through" : ""}>{i.ok ? "✓" : "○"} {i.label}</li>)}
      </ul>
    </div>
  );
}

function Grow({ p, me, onDone, setMsg }: { p: Detail["plot"]; me: Me; onDone: () => void; setMsg: (s: string) => void }) {
  const [amt, setAmt] = useState(1000);
  const [coins, setCoins] = useState(100);
  const [busy, setBusy] = useState(false);
  const boost = async () => {
    setBusy(true);
    try {
      const r = await api<{ url: string }>("/api/checkout", { method: "POST", body: JSON.stringify({ kind: "boost", plotId: p.id, amountCents: amt }) });
      window.location.href = r.url;
    } catch (e) { setMsg((e as Error).message); setBusy(false); }
  };
  const convert = async () => {
    setBusy(true);
    try {
      const r = await api<{ cents: number }>("/api/arcade/convert", { method: "POST", body: JSON.stringify({ plotId: p.id, coins }) });
      setMsg(`+${formatMoney(r.cents)} of height from coins`);
      onDone();
    } catch (e) { setMsg((e as Error).message); }
    setBusy(false);
  };
  const tier = async (t: "pro" | "landmark") => {
    setBusy(true);
    try {
      const r = await api<{ url: string }>("/api/checkout", { method: "POST", body: JSON.stringify({ kind: "tier", plotId: p.id, tier: t }) });
      window.location.href = r.url;
    } catch (e) { setMsg((e as Error).message); setBusy(false); }
  };
  return (
    <div className="rounded-2xl border border-white/10 p-4" id="coins">
      <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Grow</div>
      <div className="mt-2 flex items-center gap-2">
        <input type="number" min={1} step={1} className="input" value={amt / 100} onChange={(e) => setAmt(Math.max(100, Math.round(Number(e.target.value) * 100)))} />
        <button className="btn-primary whitespace-nowrap" disabled={busy} onClick={boost}>Boost +{formatMoney(amt)}</button>
      </div>
      <p className="mt-1 text-[11px] text-slate-500">Adds to your value (and height). Raises the takeover price to {formatMoney(splitTakeover(p.valueCents + amt).price)} and what you'd get paid.</p>
      <div className="mt-3 flex items-center gap-2">
        <input type="number" min={100} step={100} className="input" value={coins} onChange={(e) => setCoins(Number(e.target.value))} />
        <button className="btn-ghost whitespace-nowrap" disabled={busy || me.coins < 100} onClick={convert}>Convert coins</button>
      </div>
      <p className="mt-1 text-[11px] text-slate-500">100 coins = $1 of height. You have {me.coins}.</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {(["pro", "landmark"] as const).map((t) => (
          <button key={t} onClick={() => tier(t)} disabled={busy || p.tier === t} className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-left hover:border-amber-300/50 disabled:opacity-50">
            <div className="flex items-baseline justify-between"><span className="font-bold">{TIERS[t].name}</span><span className="mono text-amber-300">{formatMoney(TIERS[t].priceCents)}/mo</span></div>
            <ul className="mt-1 text-[11px] text-slate-400">{TIERS[t].perks.slice(0, 3).map((x) => <li key={x}>· {x}</li>)}</ul>
          </button>
        ))}
      </div>
    </div>
  );
}

function Protect({ p, takeover, setMsg }: { p: Detail["plot"]; takeover: ReturnType<typeof splitTakeover>; setMsg: (s: string) => void }) {
  void setMsg;
  return (
    <div className="rounded-2xl border border-white/10 p-4">
      <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Takeover exposure</div>
      <div className="mono mt-1 text-3xl font-bold">{formatMoney(takeover.price)}</div>
      <p className="text-xs text-slate-300">is what someone pays to take Plot #{p.id}. You would receive <b className="text-white">{formatMoney(takeover.sellerPayout)}</b> as credit, a {formatMoney(takeover.sellerPayout - p.valueCents)} profit on your {formatMoney(p.valueCents)}.</p>
      <ul className="mt-3 space-y-1 text-xs text-slate-400">
        <li>• You get an email the moment it happens, with your payout.</li>
        <li>• Boosting raises the price buyers pay and your payout.</li>
        <li>• Landmark adds a 7-day shield after purchase and a notice before any takeover.</li>
        <li>• Changed hands {Math.max(0, p.salesCount - 1)}× so far.</li>
      </ul>
    </div>
  );
}

function Edit({ p, onSaved, setMsg }: { p: Detail["plot"]; onSaved: (d: Partial<Detail["plot"]>) => void; setMsg: (s: string) => void }) {
  const [d, setD] = useState({ name: p.name, tagline: p.tagline ?? "", description: p.description ?? "", website: p.website ?? "", logoUrl: p.logoUrl ?? "", color: p.color, accent: p.accent, style: p.style, shape: p.shape, roof: p.roof, district: p.district });
  const [busy, setBusy] = useState(false);
  useEffect(() => setD({ name: p.name, tagline: p.tagline ?? "", description: p.description ?? "", website: p.website ?? "", logoUrl: p.logoUrl ?? "", color: p.color, accent: p.accent, style: p.style, shape: p.shape, roof: p.roof, district: p.district }), [p]);
  const save = async () => {
    setBusy(true);
    try {
      const r = await api<{ plot: Detail["plot"] }>(`/api/plot/${p.id}`, { method: "PATCH", body: JSON.stringify(d) });
      onSaved(r.plot);
    } catch (e) { setMsg((e as Error).message); }
    setBusy(false);
  };
  const upload = async (file: File) => {
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch("/api/upload", { method: "POST", body: fd });
    const j = await r.json();
    if (!r.ok) return setMsg(j.error);
    setD((x) => ({ ...x, logoUrl: j.url }));
  };
  return (
    <div className="rounded-2xl border border-white/10 p-4">
      <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Edit building · free, instant</div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div><label className="label">Name</label><input className="input" maxLength={40} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></div>
        <div><label className="label">Website</label><input className="input" value={d.website} onChange={(e) => setD({ ...d, website: e.target.value })} /></div>
        <div className="md:col-span-2"><label className="label">Tagline</label><input className="input" maxLength={90} value={d.tagline} onChange={(e) => setD({ ...d, tagline: e.target.value })} /></div>
        <div className="md:col-span-2"><label className="label">Description</label><textarea className="input" rows={3} maxLength={600} value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} /></div>
        <div>
          <label className="label">Logo</label>
          <div className="flex items-center gap-2">
            <img src={d.logoUrl || `/api/logo/${p.id}`} alt="" className="h-12 w-12 rounded-lg bg-white/10 object-cover" />
            <label className="btn-ghost cursor-pointer text-xs">Upload<input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} /></label>
            <input className="input text-xs" placeholder="or image URL" value={d.logoUrl.startsWith("data:") ? "" : d.logoUrl} onChange={(e) => setD({ ...d, logoUrl: e.target.value })} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="label">Color</label><input type="color" className="h-10 w-full rounded-xl bg-transparent" value={d.color} onChange={(e) => setD({ ...d, color: e.target.value })} /></div>
          <div><label className="label">Accent</label><input type="color" className="h-10 w-full rounded-xl bg-transparent" value={d.accent} onChange={(e) => setD({ ...d, accent: e.target.value })} /></div>
        </div>
        <div><label className="label">Shape</label><select className="input" value={d.shape} onChange={(e) => setD({ ...d, shape: e.target.value })}>{BUILDING_SHAPES.map((x) => <option key={x}>{x}</option>)}</select></div>
        <div><label className="label">Windows</label><select className="input" value={d.style} onChange={(e) => setD({ ...d, style: e.target.value })}>{BUILDING_STYLES.map((x) => <option key={x}>{x}</option>)}</select></div>
        <div><label className="label">Roof</label><select className="input" value={d.roof} onChange={(e) => setD({ ...d, roof: e.target.value })}>{ROOF_STYLES.map((x) => <option key={x}>{x}</option>)}</select></div>
        <div><label className="label">District</label><select className="input" value={d.district} onChange={(e) => setD({ ...d, district: e.target.value })}>{Object.entries(DISTRICTS).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}</select></div>
      </div>
      <button className="btn-primary mt-3" disabled={busy || !d.name.trim()} onClick={save}>{busy ? "Saving…" : "Save changes"}</button>
    </div>
  );
}

function Code({ title, blurb, code }: { title: string; blurb: string; code: string }) {
  return (
    <div className="rounded-2xl border border-white/10 p-4">
      <div className="text-xs font-bold uppercase tracking-wider text-slate-400">{title}</div>
      <p className="mt-1 text-xs text-slate-400">{blurb}</p>
      <textarea readOnly className="input mono mt-2 text-[11px]" rows={3} value={code} onFocus={(e) => e.target.select()} />
    </div>
  );
}
