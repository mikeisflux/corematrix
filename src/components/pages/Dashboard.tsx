"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChangePassword } from "@/components/ui/AuthForms";
import { api } from "@/lib/hall/store";
import { BANNER_STYLES, CATEGORIES, formatCount, formatMoney, splitTakeover, TIERS, BOOTH_SIZES, BANNER, bannerWidth, bannerUpgradeCents } from "@/lib/config";
import { Bars } from "@/components/ui/Sparkline";
import { timeAgo } from "@/lib/util";

interface Me { id: string; email: string; displayName: string | null; coins: number; streak: number; creditCents: number; referralCode: string; isAdmin: boolean; notifyEmail: boolean }
interface MyBooth { id: number; name: string | null; valueCents: number; tier: string; color: string }
interface Detail {
  booth: { id: number; name: string; tagline: string | null; description: string | null; website: string | null; logoUrl: string | null; color: string; accent: string; style: string; cloth: string; bannerHeight: number; category: string; size: string; hall: string; label: string; kind: string; tier: string; tierUntil: number | null; subscriptionStatus: string | null; featuredUntil: number | null; valueCents: number; totalViews: number; totalClicks: number; totalImpressions: number; claimedAt: number | null; salesCount: number; isOwner: boolean };
  rank: number;
  prevRank: number | null;
  series: Array<{ day: string; impressions: number; hovers: number; views: number; clicks: number; uniques: number; conversions?: number; conversionValueCents?: number }>;
  totals: { impressions: number; views: number; clicks: number; uniques: number };
  referrers: Array<{ source: string; views: number; clicks: number }>;
  history: Array<{ id: string; kind: string; amountCents: number; valueAfter: number; createdAt: number; sellerPayoutCents: number }>;
}

export function Dashboard({ initialBooth }: { initialBooth: number | null }) {
  const [me, setMe] = useState<Me | null>(null);
  const [booths, setBooths] = useState<MyBooth[]>([]);
  const [sel, setSel] = useState<number | null>(initialBooth);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [range, setRange] = useState<7 | 30 | 90>(30);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = await api<{ user: Me; booths: MyBooth[] }>("/api/me");
    setMe(d.user);
    setBooths(d.booths);
    if (!sel && d.booths[0]) setSel(d.booths[0].id);
  }, [sel]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!sel) return;
    api<Detail>(`/api/booth/${sel}`).then(setDetail).catch(() => setDetail(null));
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

  if (booths.length === 0) {
    return (
      <div className="mx-auto max-w-xl text-center">
        <h1 className="text-3xl font-bold">You don't have a booth yet</h1>
        <p className="mt-2 text-slate-300">Get a booth from $5. You'll get a permanent booth number, your banner on the show floor, and daily numbers on who saw it and who clicked.</p>
        <Link href="/app?claim=1" className="btn-primary mt-6">Claim a booth →</Link>
        <div className="mt-8 rounded-2xl border border-white/10 p-4 text-left text-sm">
          <div className="font-bold">Your balances</div>
          <div className="mt-1 text-slate-300">{me.coins} arcade coins · {formatMoney(me.creditCents)} credit (spendable on any claim or takeover)</div>
          <div className="mt-2 text-xs text-slate-500">Referral link: <span className="mono">{origin}/?ref={me.referralCode}</span></div>
        </div>
      </div>
    );
  }

  const p = detail?.booth;
  const takeover = p ? splitTakeover(p.valueCents) : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <aside className="space-y-3">
        <div className="rounded-2xl border border-white/10 p-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Your balances</div>
          <div className="mt-1 flex items-baseline gap-3"><span className="mono text-2xl font-bold text-amber-300">{me.coins}</span><span className="text-xs text-slate-400">coins · {me.streak}-day streak</span></div>
          <div className="mono text-lg">{formatMoney(me.creditCents)} <span className="text-xs text-slate-400">credit</span></div>
          <p className="mt-1 text-[11px] text-slate-500">Credit comes from takeover payouts and referrals. Spend it on any claim, takeover, boost or billboard. Payouts to your bank: email us.</p>
        </div>
        <div className="rounded-2xl border border-white/10 p-2">
          <div className="px-2 pb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">Your booths</div>
          {booths.map((b) => (
            <button key={b.id} onClick={() => setSel(b.id)} className={`flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left ${sel === b.id ? "bg-amber-300/15" : "hover:bg-white/5"}`}>
              <span className="h-8 w-8 shrink-0 rounded-lg" style={{ background: b.color }} />
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold">{b.name}</span><span className="block text-[11px] text-slate-400">#{b.id} · {formatMoney(b.valueCents)} · {b.tier}</span></span>
            </button>
          ))}
          <Link href="/app?claim=1" className="btn-ghost mt-1 w-full text-xs">+ Claim another booth</Link>
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
              <div className="text-xs text-slate-400">
                {p.kind === "artist" ? `Table ${p.label}` : `Booth ${p.label}`} · Hall {p.hall} · {BOOTH_SIZES[p.size as keyof typeof BOOTH_SIZES]?.short ?? p.size} · {CATEGORIES[p.category]?.name} · rank <b className="text-white">#{detail.rank}</b>
                {detail.prevRank != null && detail.prevRank !== detail.rank && (
                  <span className={detail.prevRank > detail.rank ? "text-emerald-400" : "text-rose-400"}> {detail.prevRank > detail.rank ? "▲" : "▼"} {Math.abs(detail.prevRank - detail.rank)} since last week (#{detail.prevRank})</span>
                )}
                {p.featuredUntil && p.featuredUntil > Date.now() && <span className="ml-2 rounded-full bg-amber-300/20 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-300">🏆 featured this week</span>}
              </div>
            </div>
            <Link href={`/app/booth/${p.id}`} className="btn-ghost text-xs">Public page</Link>
            <Link href={`/app?booth=${p.id}`} className="btn-ghost text-xs">Walk to it</Link>
            <div className="flex rounded-xl bg-white/5 p-0.5">{([7, 30, 90] as const).map((r) => <button key={r} onClick={() => setRange(r)} className={`rounded-lg px-3 py-1 text-xs ${range === r ? "bg-amber-300 text-slate-950 font-semibold" : ""}`}>{r}d</button>)}</div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
            <K label="Impressions" v={formatCount(sums.impressions)} sub="seen on the show floor" />
            <K label="Unique visitors" v={formatCount(sums.uniques)} />
            <K label="Booth visits" v={formatCount(sums.views)} sub={prev ? `${delta(sums.views, prev.views)} vs prior` : undefined} />
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
            <Grow p={p} me={me} onDone={() => { void load(); api<Detail>(`/api/booth/${p.id}`).then(setDetail); }} setMsg={setMsg} />
            <Protect p={p} takeover={takeover!} setMsg={setMsg} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Plan p={p} setMsg={setMsg} onChanged={() => api<Detail>(`/api/booth/${p.id}`).then(setDetail)} />
            <Emails me={me} onChanged={() => void load()} />
          </div>

          <Edit p={p} onSaved={(d) => { setDetail({ ...detail, booth: { ...detail.booth, ...d } }); setMsg("Saved. The show floor updates instantly."); }} setMsg={setMsg} />

          <div className="grid gap-4 md:grid-cols-2">
            <Code title="Conversion pixel" blurb="Put this on your thank-you / signup success page. Pass the order value in cents with ?v= to see revenue next to clicks." code={`<img src="${origin}/api/px/${p.id}?v=0" width="1" height="1" alt="" />`} />
            <Code title="Badge for your site" blurb="Links back to your booth. Clicks count as referrals and raise your trending score." code={`<a href="${origin}/app/booth/${p.id}?src=embed"><img src="${origin}/app/embed/${p.id}" alt="${p.name} on the skyline" width="320" height="64" /></a>`} />
          </div>

          {detail.history.length > 0 && (
            <div className="rounded-2xl border border-white/10 p-4">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Transactions on this booth</div>
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
        <p className="text-slate-400">Loading booth…</p>
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

function Checklist({ p }: { p: Detail["booth"] }) {
  const items = [
    { ok: !!p.logoUrl, label: "Upload a real logo (initials are the fallback)" },
    { ok: !!p.website, label: "Add your website link" },
    { ok: !!p.tagline, label: "Write a one-line tagline" },
    { ok: p.totalClicks > 0, label: "Get your first website click" },
    { ok: p.totalViews >= 50, label: "Reach 50 booth visits (share your card on X)" },
  ];
  const done = items.filter((i) => i.ok).length;
  if (done === items.length) return null;
  return (
    <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4">
      <div className="flex items-center justify-between"><div className="font-bold">Get the most from your booth · {done}/{items.length}</div></div>
      <ul className="mt-2 grid gap-1 text-sm md:grid-cols-2">
        {items.map((i) => <li key={i.label} className={i.ok ? "text-slate-500 line-through" : ""}>{i.ok ? "✓" : "○"} {i.label}</li>)}
      </ul>
    </div>
  );
}

function Grow({ p, me, onDone, setMsg }: { p: Detail["booth"]; me: Me; onDone: () => void; setMsg: (s: string) => void }) {
  const [amt, setAmt] = useState(1000);
  const [coins, setCoins] = useState(100);
  const [busy, setBusy] = useState(false);
  const boost = async () => {
    setBusy(true);
    try {
      const r = await api<{ url: string }>("/api/checkout", { method: "POST", body: JSON.stringify({ kind: "boost", boothId: p.id, amountCents: amt }) });
      window.location.href = r.url;
    } catch (e) { setMsg((e as Error).message); setBusy(false); }
  };
  const convert = async () => {
    setBusy(true);
    try {
      const r = await api<{ cents: number }>("/api/arcade/convert", { method: "POST", body: JSON.stringify({ boothId: p.id, coins }) });
      setMsg(`+${formatMoney(r.cents)} of height from coins`);
      onDone();
    } catch (e) { setMsg((e as Error).message); }
    setBusy(false);
  };
  const [height, setHeight] = useState<number>(0);
  const bannerMax = p.kind === "artist" ? BANNER.artistMaxHeight : BANNER.maxHeight;
  const bannerNow = p.bannerHeight || BANNER.defaultHeight;
  const bannerChoices = BANNER.heights.filter((h) => h > bannerNow && h <= bannerMax);
  const banner = async () => {
    if (!height) return;
    setBusy(true);
    try {
      const r = await api<{ url: string }>("/api/checkout", { method: "POST", body: JSON.stringify({ kind: "banner", boothId: p.id, height }) });
      window.location.href = r.url;
    } catch (e) { setMsg((e as Error).message); setBusy(false); }
  };
  const tier = async (t: "pro" | "landmark") => {
    setBusy(true);
    try {
      const r = await api<{ url: string }>("/api/checkout", { method: "POST", body: JSON.stringify({ kind: "tier", boothId: p.id, tier: t }) });
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
      <div className="mt-4 text-xs font-bold uppercase tracking-wider text-slate-400">Roll-up banner · {bannerWidth(bannerNow)}×{bannerNow} ft</div>
      {bannerChoices.length > 0 ? (
        <>
          <div className="mt-2 flex flex-wrap gap-2">
            {bannerChoices.map((h) => (
              <button key={h} type="button" onClick={() => setHeight(h)} className={`rounded-xl border px-3 py-2 text-left text-sm ${height === h ? "border-amber-300 bg-amber-300/10" : "border-white/10 hover:border-white/30"}`}>
                <div className="font-semibold">{bannerWidth(h)}×{h} ft</div>
                <div className="text-[11px] text-slate-400">{formatMoney(bannerUpgradeCents(bannerNow, h))} one-time</div>
              </button>
            ))}
            <button className="btn-primary whitespace-nowrap self-center" disabled={busy || !height} onClick={banner}>Upgrade banner</button>
          </div>
          <p className="mt-1 text-[11px] text-slate-500">A taller retractable banner at your booth, up to {bannerMax} ft. The spend also counts toward your value.</p>
        </>
      ) : (
        <p className="mt-1 text-[11px] text-slate-500">{p.kind === "artist" ? `Artists' Alley banners are ${bannerWidth(BANNER.artistMaxHeight)}×${BANNER.artistMaxHeight} ft.` : "Your banner is at the maximum height."}</p>
      )}
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

function Plan({ p, setMsg, onChanged }: { p: Detail["booth"]; setMsg: (s: string) => void; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const t = p.tier as keyof typeof TIERS;
  const cancel = async () => {
    if (!confirm("Cancel this plan? You keep the perks until the paid period ends.")) return;
    setBusy(true);
    try {
      await api("/api/plan", { method: "POST", body: JSON.stringify({ boothId: p.id, action: "cancel" }) });
      setMsg("Plan will end at the close of the current period.");
      onChanged();
    } catch (e) { setMsg((e as Error).message); }
    setBusy(false);
  };
  const until = p.tierUntil ? new Date(p.tierUntil).toLocaleDateString() : null;
  return (
    <div className="rounded-2xl border border-white/10 p-4">
      <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Plan</div>
      <div className="mt-1 flex items-baseline justify-between"><span className="text-xl font-bold">{TIERS[t]?.name ?? "Owner"}</span>{t !== "free" && <span className="mono text-amber-300">{formatMoney(TIERS[t].priceCents)} / 30 days</span>}</div>
      {t === "free" ? (
        <p className="mt-1 text-xs text-slate-400">Included with every booth. Upgrade in the Grow panel for 90-day history, referrers, a hanging sign, bigger signage and more.</p>
      ) : (
        <>
          <p className="mt-1 text-xs text-slate-300">
            {p.subscriptionStatus === "active" && <>Renews automatically on <b>{until}</b>.</>}
            {p.subscriptionStatus === "canceling" && <>Canceled. Perks continue until <b>{until}</b>, then the booth returns to the Exhibitor plan.</>}
            {p.subscriptionStatus === "past_due" && <span className="text-rose-400">Last payment failed. Renew the plan to save a new card, or perks end on {until}.</span>}
            {p.subscriptionStatus === "canceled" && <>Subscription ended. Perks continue until <b>{until}</b>.</>}
            {!p.subscriptionStatus && <>Active until <b>{until}</b>.</>}
          </p>
          <ul className="mt-2 text-[11px] text-slate-400">{TIERS[t].perks.map((x) => <li key={x}>· {x}</li>)}</ul>
          {p.subscriptionStatus === "active" && <button className="mt-3 text-xs text-slate-400 hover:text-white" disabled={busy} onClick={cancel}>Cancel plan</button>}
        </>
      )}
    </div>
  );
}

function Emails({ me, onChanged }: { me: Me; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    setBusy(true);
    await api("/api/me", { method: "PATCH", body: JSON.stringify({ notifyEmail: !me.notifyEmail }) });
    onChanged();
    setBusy(false);
  };
  return (
    <div className="rounded-2xl border border-white/10 p-4">
      <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Emails</div>
      <p className="mt-1 text-xs text-slate-300">A weekly report every Monday (views, clicks, CTR, rank movement), an email the moment you're bought out with your payout, a heads-up when someone opens your takeover page, and season results.</p>
      <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={me.notifyEmail} onChange={toggle} disabled={busy} /> Send me these</label>
      <div className="mt-4 border-t border-white/10 pt-3"><div className="text-xs font-bold uppercase tracking-wider text-slate-400">Password</div><div className="mt-2 max-w-sm"><ChangePassword /></div></div>
    </div>
  );
}

function Protect({ p, takeover, setMsg }: { p: Detail["booth"]; takeover: ReturnType<typeof splitTakeover>; setMsg: (s: string) => void }) {
  void setMsg;
  return (
    <div className="rounded-2xl border border-white/10 p-4">
      <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Takeover exposure</div>
      <div className="mono mt-1 text-3xl font-bold">{formatMoney(takeover.price)}</div>
      <p className="text-xs text-slate-300">is what someone pays to take Booth #{p.id}. You would receive <b className="text-white">{formatMoney(takeover.sellerPayout)}</b> as credit, a {formatMoney(takeover.sellerPayout - p.valueCents)} profit on your {formatMoney(p.valueCents)}.</p>
      <ul className="mt-3 space-y-1 text-xs text-slate-400">
        <li>• You get an email the moment it happens, with your payout.</li>
        <li>• Boosting raises the price buyers pay and your payout.</li>
        <li>• Landmark adds a 7-day shield after purchase and a notice before any takeover.</li>
        <li>• Changed hands {Math.max(0, p.salesCount - 1)}× so far.</li>
      </ul>
    </div>
  );
}

function Edit({ p, onSaved, setMsg }: { p: Detail["booth"]; onSaved: (d: Partial<Detail["booth"]>) => void; setMsg: (s: string) => void }) {
  const [d, setD] = useState({ name: p.name, tagline: p.tagline ?? "", description: p.description ?? "", website: p.website ?? "", logoUrl: p.logoUrl ?? "", color: p.color, accent: p.accent, style: p.style, cloth: p.cloth, category: p.category });
  const [busy, setBusy] = useState(false);
  useEffect(() => setD({ name: p.name, tagline: p.tagline ?? "", description: p.description ?? "", website: p.website ?? "", logoUrl: p.logoUrl ?? "", color: p.color, accent: p.accent, style: p.style, cloth: p.cloth, category: p.category }), [p]);
  const save = async () => {
    setBusy(true);
    try {
      const r = await api<{ booth: Detail["booth"] }>(`/api/booth/${p.id}`, { method: "PATCH", body: JSON.stringify(d) });
      onSaved(r.booth);
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
      <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Edit booth · free, instant</div>
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
        <div><label className="label">Banner style</label><select className="input" value={d.style} onChange={(e) => setD({ ...d, style: e.target.value })}>{BANNER_STYLES.map((x) => <option key={x}>{x}</option>)}</select></div>
        <div><label className="label">Table cloth / drapes</label><input type="color" className="h-10 w-full rounded-xl bg-transparent" value={d.cloth} onChange={(e) => setD({ ...d, cloth: e.target.value })} /></div>
        <div><label className="label">Category</label><select className="input" value={d.category} onChange={(e) => setD({ ...d, category: e.target.value })}>{Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v.name}</option>)}</select></div>
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
