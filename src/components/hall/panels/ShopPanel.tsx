"use client";
import { useEffect, useState } from "react";
import { useHall } from "@/lib/hall/store";
import { PanelHeader, SignIn } from "./common";
import { useShop, refreshShop, buyItem, claimSponsor } from "@/lib/hall/shop";
import { itemById } from "@/lib/hall/items";
import { boothSpace } from "@/lib/hall/layout";
import { COSTUMES } from "@/lib/hall/costumes";

const left = (endsAt: number) => { const h = Math.max(0, Math.round((endsAt - Date.now()) / 3_600_000)); return h >= 48 ? `${Math.round(h / 24)} days left` : `${h} h left`; };

/** Costumes and reaction packs for coins, and what booths are giving away this week. */
export function ShopPanel() {
  const me = useHall((s) => s.me);
  const near = useHall((s) => s.near);
  const setAvatar = useHall((s) => s.setAvatar);
  const setPanel = useHall((s) => s.setPanel);
  const setMode = useHall((s) => s.setMode);
  const setFlyTo = useHall((s) => s.setFlyTo);
  const setToast = useHall((s) => s.setToast);
  const booths = useHall((s) => s.booths);
  const shop = useShop();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { void refreshShop(); }, [me]);
  const buy = async (id: string) => {
    if (!me) { setPanel("me"); return; }
    setBusy(id); setErr(null);
    try { const it = await buyItem(id); setToast(`${it.icon} ${it.name} is yours`); if (it.costume) setAvatar({ costume: it.costume }); }
    catch (e) { setErr((e as Error).message); }
    setBusy(null);
  };
  const claim = async (sponsorId: string) => {
    if (!me) { setPanel("me"); return; }
    setBusy(sponsorId); setErr(null);
    try { const r = await claimSponsor(sponsorId); setToast(r.already ? `You already have ${r.item.name}` : `🎁 ${r.item.name} from ${r.boothName ?? "the booth"} is yours`); if (r.item.costume) setAvatar({ costume: r.item.costume }); }
    catch (e) { setErr((e as Error).message); }
    setBusy(null);
  };
  const costumes = shop.items.filter((i) => i.kind === "costume"), packs = shop.items.filter((i) => i.kind === "reactions");
  return (
    <>
      <PanelHeader title="Shop" sub={me ? `${me.coins} coins · quests and the arcade pay more` : "Costumes and reactions for coins"} />
      <div className="space-y-3 p-3">
        {shop.sponsors.length > 0 && (
          <section className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-300">🎁 Free at a booth right now</div>
            <ul className="mt-1.5 space-y-1.5">
              {shop.sponsors.map((s) => { const it = itemById(s.itemId); if (!it) return null; const owned = shop.owned.has(s.itemId); const here = near === s.boothId; return (
                <li key={s.id} className="flex items-center gap-2 text-sm">
                  <span className="text-lg">{it.icon}</span>
                  <span className="min-w-0 flex-1"><b>{it.name}</b> <span className="text-slate-300">from {s.boothName ?? `booth ${boothSpace(s.boothId)?.label ?? s.boothId}`}</span><span className="block text-[11px] text-slate-400">{left(s.endsAt)} · {s.claims} claimed{owned ? " · you have it" : ""}</span></span>
                  {owned ? null : here ? <button className="btn-primary text-xs" disabled={busy === s.id} onClick={() => claim(s.id)}>Claim</button> : <button className="btn-ghost text-xs" onClick={() => { setMode("walk"); setFlyTo(s.boothId); setPanel("none"); }}>Walk there</button>}
                </li>); })}
            </ul>
            <p className="mt-1.5 text-[11px] text-slate-400">Walk up to the booth and claim it there. Exhibitors sponsor an item so people come by.</p>
          </section>
        )}
        <section>
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Costumes</div>
          <div className="grid grid-cols-2 gap-1.5">
            {costumes.map((it) => { const owned = shop.owned.has(it.id); const c = it.costume ? COSTUMES[it.costume] : null; return (
              <div key={it.id} className="rounded-xl border border-white/10 bg-white/[0.04] p-2">
                <div className="flex items-center gap-2"><span className="h-8 w-8 rounded-lg" style={{ background: `linear-gradient(135deg, ${c?.colors.costume ?? "#888"}, ${c?.colors.costume2 ?? "#aaa"})` }} /><div className="min-w-0"><div className="truncate text-sm font-semibold">{it.name}</div><div className="truncate text-[11px] text-slate-400">{it.blurb}</div></div></div>
                {owned ? <button className="btn-ghost mt-2 w-full text-xs" onClick={() => { if (it.costume) setAvatar({ costume: it.costume }); setPanel("avatar"); }}>Wear it</button> : <button className="btn-primary mt-2 w-full text-xs" disabled={busy === it.id} onClick={() => buy(it.id)}>{it.coins} coins</button>}
              </div>); })}
          </div>
        </section>
        <section>
          <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Reaction packs</div>
          <ul className="space-y-1.5">
            {packs.map((it) => { const owned = shop.owned.has(it.id); return (
              <li key={it.id} className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] p-2 text-sm">
                <span className="text-xl">{it.reactions?.join(" ")}</span>
                <span className="min-w-0 flex-1"><b>{it.name}</b><span className="block text-[11px] text-slate-400">Added to your reactions under 🙌 Emotes</span></span>
                {owned ? <span className="text-[11px] text-emerald-300">✓ yours</span> : <button className="btn-primary text-xs" disabled={busy === it.id} onClick={() => buy(it.id)}>{it.coins} coins</button>}
              </li>); })}
          </ul>
        </section>
        {!me && <SignIn note="Sign in to buy with coins. New players start with free coins, and every day on the floor pays more." />}
        {me && <p className="text-[11px] text-slate-500">Short on coins? Daily quests pay up to 45 a day, the arcade pays prizes, and packs are in 🕹️ Arcade.</p>}
        {err && <p className="text-xs text-rose-400">{err}</p>}
      </div>
    </>
  );
}
