import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/pages/Shell";
import { getBooth, boothHistory, claimedBooths } from "@/lib/economy";
import { boothSeries, sumSeries, trackBooth } from "@/lib/analytics";
import { CATEGORIES, formatCount, formatMoney, SITE_NAME, splitTakeover, BOOTH_SIZES, ZONES } from "@/lib/config";
import { boothSpace, describeSpace } from "@/lib/hall/layout";
import { timeAgo } from "@/lib/util";
import { Bars } from "@/components/ui/Sparkline";
import { currentUser } from "@/lib/auth";
import { visitorId } from "@/lib/auth";
import { ClientTrack } from "@/components/ui/ClientTrack";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const p = await getBooth(Number(id));
  if (!p?.ownerId) return { title: `Booth ${boothSpace(Number(id))?.label ?? id} is open` };
  return {
    title: `${p.name} · Booth ${p.label}`,
    description: p.tagline ?? `${p.name} is exhibiting at booth ${p.label} on ${SITE_NAME}.`,
    openGraph: { title: `${p.name} · Booth ${p.label} on ${SITE_NAME}`, description: p.tagline ?? undefined, images: [`/api/og/${p.id}`] },
    twitter: { card: "summary_large_image", images: [`/api/og/${p.id}`] },
  };
}

export default async function BoothPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const boothId = Number(id);
  if (!Number.isFinite(boothId) || boothId < 1) notFound();
  const p = await getBooth(boothId);
  const space = boothSpace(boothId);
  if (!space) notFound();
  if (!p?.ownerId) {
    return (
      <Shell>
        <div className="mx-auto max-w-xl text-center">
          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-300">Open space</div>
          <h1 className="mt-2 text-4xl font-bold">{space.kind === "artist" ? `Table ${space.label}` : `Booth ${space.label}`}</h1>
          <p className="mt-2 text-slate-300">{describeSpace(space)}. {BOOTH_SIZES[space.size].blurb} {ZONES[space.zone].blurb}</p>
          <div className="mono mt-4 text-5xl font-bold text-amber-300">{formatMoney(space.priceCents)}</div>
          <p className="text-sm text-slate-400">{BOOTH_SIZES[space.size].name} · {ZONES[space.zone].name}</p>
          <Link href={`/app?booth=${boothId}`} className="btn-primary mt-6">Set up & claim this space →</Link>
        </div>
      </Shell>
    );
  }
  const user = await currentUser();
  const vid = await visitorId();
  await trackBooth(boothId, "views", vid, sp.src ?? (sp.utm_source ? "share" : "direct"));
  const [series, history, all] = await Promise.all([boothSeries(boothId, 30), boothHistory(boothId), claimedBooths()]);
  const totals = sumSeries(series.slice(-7));
  const rank = all.filter((x) => x.valueCents > p.valueCents).length + 1;
  const { price, sellerPayout } = splitTakeover(p.valueCents);
  const isOwner = user?.id === p.ownerId;
  const paid = sp.paid;
  return (
    <Shell>
      <ClientTrack boothId={boothId} />
      {paid && (
        <div className="mb-6 rounded-2xl border border-emerald-400/30 bg-emerald-400/10 p-4">
          <div className="font-bold">{paid === "claim" ? "Welcome to the show. Your booth is live." : paid === "takeover" ? "The booth is yours." : "Done."}</div>
          <p className="mt-1 text-sm text-slate-300">
            Next: share your card on X, add the badge to your site, and check your dashboard tomorrow for the first numbers. {" "}
            <Link className="text-amber-300 underline" href={`/app/dashboard?booth=${boothId}`}>Open the dashboard →</Link>
          </p>
        </div>
      )}
      <div className="grid gap-8 md:grid-cols-[1fr_320px]">
        <div>
          <div className="flex items-start gap-4">
            <img src={`/api/logo/${boothId}`} alt="" className="h-24 w-24 rounded-2xl bg-white/10 object-cover" />
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-300">{describeSpace(space)} · {CATEGORIES[p.category]?.name ?? p.category} · rank #{rank}</div>
              <h1 className="mt-1 text-3xl font-bold">{p.name}</h1>
              {p.tagline && <p className="text-slate-300">{p.tagline}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                {p.website && <a className="btn-primary" href={`/app/go/${boothId}?src=page`} target="_blank" rel="noopener">Visit website →</a>}
                <Link href={`/app?booth=${boothId}`} className="btn-ghost">See it on the floor</Link>
                <a className="btn-ghost" target="_blank" rel="noopener" href={`https://x.com/intent/post?text=${encodeURIComponent(`${p.name} is exhibiting at ${SITE_NAME}, booth ${space.label}`)}&url=${encodeURIComponent(`${process.env.NEXT_PUBLIC_SITE_URL}/app/booth/${boothId}?src=share`)}`}>Share on X</a>
              </div>
            </div>
          </div>
          {p.description && <p className="mt-6 whitespace-pre-line text-slate-200">{p.description}</p>}
          <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
            <K label="Value" v={formatMoney(p.valueCents)} accent />
            <K label="Space" v={BOOTH_SIZES[space.size]?.short ?? p.size} />
            <K label="Visits (7d)" v={formatCount(totals.views)} sub={`${formatCount(p.totalViews)} all time`} />
            <K label="Clicks (7d)" v={formatCount(totals.clicks)} sub={`${totals.views ? ((totals.clicks / totals.views) * 100).toFixed(1) : "0.0"}% CTR`} />
          </div>
          <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="mb-2 flex items-center justify-between text-xs text-slate-400"><span>Visits, last 30 days</span><span>Public stats. Owners see impressions, uniques, referrers and conversions.</span></div>
            <Bars rows={series.map((r) => ({ day: r.day, value: r.views }))} />
          </div>
          {history.length > 0 && (
            <div className="mt-6">
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">Ownership & value history</h2>
              <ul className="mt-2 divide-y divide-white/8 rounded-2xl border border-white/10">
                {history.slice().reverse().map((h) => (
                  <li key={h.id} className="flex items-center justify-between px-4 py-2 text-sm"><span className="capitalize">{h.kind}</span><span className="mono">{formatMoney(h.valueAfter)}<span className="ml-2 text-slate-500">{timeAgo(h.createdAt)}</span></span></li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <aside className="space-y-4">
          <div className="rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4">
            <div className="text-[11px] font-bold uppercase tracking-wider text-amber-300">{isOwner ? "You own this" : "Take it over"}</div>
            {isOwner ? (
              <>
                <p className="mt-1 text-sm text-slate-200">Someone can buy you out for {formatMoney(price)}. You'd receive {formatMoney(sellerPayout)}.</p>
                <Link href={`/app/dashboard?booth=${boothId}`} className="btn-primary mt-3 w-full">Manage booth</Link>
              </>
            ) : (
              <>
                <div className="mono mt-1 text-3xl font-bold">{formatMoney(price)}</div>
                <p className="text-xs text-slate-300">1.25× the current value. The owner gets {formatMoney(sellerPayout)} back ({formatMoney(sellerPayout - p.valueCents)} profit). Nobody loses money on a takeover.</p>
                <Link href={`/app?booth=${boothId}&takeover=1`} className="btn-primary mt-3 w-full">Take over →</Link>
              </>
            )}
          </div>
          <div className="rounded-2xl border border-white/10 p-4 text-sm">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Badge for your site</div>
            <img src={`/app/embed/${boothId}`} alt="" className="mt-2 w-full rounded-lg" />
            <p className="mt-2 text-[11px] text-slate-500">Owners get the embed code in the dashboard. Clicks through the badge count as referrals.</p>
          </div>
        </aside>
      </div>
    </Shell>
  );
}

function K({ label, v, sub, accent }: { label: string; v: string; sub?: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</div>
      <div className={`mono text-2xl font-bold ${accent ? "text-amber-300" : ""}`}>{v}</div>
      {sub && <div className="text-xs text-slate-400">{sub}</div>}
    </div>
  );
}
