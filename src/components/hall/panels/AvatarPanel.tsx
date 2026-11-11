"use client";
import { useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { api, useHall, SKIN_TONES, HAIR_COLORS, HAIR_NAMES, OUTFIT_COLORS, type AvatarConfig } from "@/lib/hall/store";
import { AvatarModel } from "../Avatar";
import { PanelHeader } from "./common";
import { COSTUMES, COSTUME_IDS, PREMIUM_COSTUMES, STAFF_COSTUMES } from "@/lib/hall/costumes";
import { useShop, refreshShop } from "@/lib/hall/shop";
import { itemById } from "@/lib/hall/items";

const HAIR: AvatarConfig["hair"][] = ["short", "long", "buzz", "bun", "curly", "bald"];
function Swatches({ list, value, onPick }: { list: string[]; value: string; onPick: (c: string) => void }) {
  return <div className="flex flex-wrap gap-1.5">{list.map((c) => <button key={c} onClick={() => onPick(c)} className={`h-7 w-7 rounded-full border-2 ${value === c ? "border-white" : "border-transparent"}`} style={{ background: c }} aria-label={c} />)}</div>;
}

/** Your own VRM model (VRoid Studio etc.): upload, see what its metadata says, take it off again. Signed-in only; the built-in look stays as the fallback. */
function OwnModel() {
  const avatar = useHall((s) => s.avatar);
  const setAvatar = useHall((s) => s.setAvatar);
  const setPanel = useHall((s) => s.setPanel);
  const setToast = useHall((s) => s.setToast);
  const me = useHall((s) => s.me);
  const [busy, setBusy] = useState(false);
  const [ok, setOk] = useState(false);
  const [meta, setMeta] = useState<{ name: string; author: string; permission: string } | null>(null);
  const upload = async (f: File | undefined) => {
    if (!f) return;
    if (!ok) { setToast("Tick the box first: the model must be yours or one you are allowed to use."); return; }
    if (f.size > 15 * 1024 * 1024) { setToast("That file is over 15 MB. Export a lighter model."); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/me/vrm", { method: "POST", body: f, headers: { "Content-Type": "model/gltf-binary" } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Upload failed");
      setMeta(j.meta); setAvatar({ vrm: j.vrm }); setToast(`You are now wearing ${j.meta?.name || "your model"}.`);
    } catch (e) { setToast((e as Error).message); } finally { setBusy(false); }
  };
  const remove = async () => { setBusy(true); try { await fetch("/api/me/vrm", { method: "DELETE" }); setAvatar({ vrm: null }); setMeta(null); setToast("Back to the built-in figure."); } finally { setBusy(false); } };
  const label = (p: string) => (p === "everyone" || p === "Everyone" ? "anyone may use it" : p === "onlySeparatelyLicensedPerson" || p === "ExplicitlyLicensedPerson" ? "licensed people only" : "the author only");
  return (
    <div>
      <label className="label">Your own model <span className="font-normal normal-case text-slate-500">(VRM, optional)</span></label>
      {!me ? (
        <p className="text-[11px] text-slate-400">Have a VRoid Studio or other .vrm avatar? <button className="underline" onClick={() => setPanel("me")}>Sign in</button> to wear it on the floor.</p>
      ) : avatar.vrm ? (
        <div className="rounded-lg bg-white/5 p-2 text-[11px] text-slate-300">
          <div>Wearing <b>{meta?.name || "your model"}</b>{meta?.author ? ` by ${meta.author}` : ""}{meta ? ` · its licence: ${label(meta.permission)}` : ""}.</div>
          <div className="mt-1 text-slate-500">Body, colours and costume above stay as your look for the far crowd and for anyone whose device cannot load the model.</div>
          <button disabled={busy} onClick={remove} className="mt-1.5 rounded-lg bg-white/10 px-2 py-1 text-[11px] hover:bg-white/15 disabled:opacity-50">Take it off</button>
        </div>
      ) : (
        <div className="space-y-1.5 text-[11px] text-slate-400">
          <label className="flex items-start gap-2"><input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} className="mt-0.5" /><span>This model is mine, or its licence lets me use it as my avatar. Nothing adult or hateful; admins can remove a model.</span></label>
          <label className={`inline-block cursor-pointer rounded-lg px-2 py-1 text-[11px] ${ok ? "bg-amber-300 text-slate-950 font-semibold" : "bg-white/5"} ${busy ? "opacity-50" : ""}`}>{busy ? "Uploading…" : "Upload a .vrm (up to 15 MB)"}<input type="file" accept=".vrm,model/gltf-binary" className="hidden" disabled={busy} onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ""; }} /></label>
          <p className="text-[10px] text-slate-500">VRM 0.x and 1.0 from VRoid Studio, Blender&apos;s VRM add-on or UniVRM. Lighter is better: everyone near you downloads it.</p>
        </div>
      )}
    </div>
  );
}

/** Pick a body, skin tone, hair and outfit, then walk the floor. Saved locally and on the account. */
export function AvatarPanel() {
  const avatar = useHall((s) => s.avatar);
  const setAvatar = useHall((s) => s.setAvatar);
  const setMode = useHall((s) => s.setMode);
  const setPanel = useHall((s) => s.setPanel);
  const me = useHall((s) => s.me);
  const shop = useShop();
  useEffect(() => { void refreshShop(); }, [me]);
  useEffect(() => {
    if (!me) return;
    const t = setTimeout(() => { api("/api/me", { method: "PATCH", body: JSON.stringify({ avatar }) }).catch(() => null); }, 800);
    return () => clearTimeout(t);
  }, [avatar, me]);
  return (
    <>
      <PanelHeader title="Your avatar" sub="Walk the show floor as yourself" />
      <NameAndTitle />
      <div className="space-y-3 p-3">
        <div className="h-48 overflow-hidden rounded-xl bg-gradient-to-b from-slate-800 to-slate-950">
          <Canvas camera={{ position: [0, 0.4, 12], fov: 35 }} dpr={[1, 1.5]}>
            <ambientLight intensity={0.9} />
            <directionalLight position={[4, 8, 6]} intensity={1.4} />
            <group position={[0, -3.4, 0]} rotation={[0, 0.5, 0]}><AvatarModel config={avatar} idle /></group>
          </Canvas>
        </div>
        <div>
          <label className="label">Body</label>
          <div className="grid grid-cols-2 gap-1">
            <button onClick={() => setAvatar({ body: "a" })} className={`rounded-lg px-2 py-1.5 text-xs ${avatar.body === "a" ? "bg-amber-300 text-slate-950 font-semibold" : "bg-white/5"}`}>Male</button>
            <button onClick={() => setAvatar({ body: "b" })} className={`rounded-lg px-2 py-1.5 text-xs ${avatar.body === "b" ? "bg-amber-300 text-slate-950 font-semibold" : "bg-white/5"}`}>Female</button>
          </div>
        </div>
        <div><label className="label">Skin tone</label><Swatches list={SKIN_TONES} value={avatar.skin} onPick={(skin) => setAvatar({ skin })} /></div>
        <div>
          <label className="label">Hair</label>
          <div className="grid grid-cols-6 gap-1">{HAIR.map((h) => <button key={h} onClick={() => setAvatar({ hair: h })} className={`rounded-lg px-1 py-1.5 text-[11px] ${avatar.hair === h ? "bg-amber-300 text-slate-950 font-semibold" : "bg-white/5"}`}>{HAIR_NAMES[avatar.body][h]}</button>)}</div>
        </div>
        <div><label className="label">Hair color</label><Swatches list={HAIR_COLORS} value={avatar.hairColor} onPick={(hairColor) => setAvatar({ hairColor })} /></div>
        <div><label className="label">Shirt</label><Swatches list={OUTFIT_COLORS} value={avatar.shirt} onPick={(shirt) => setAvatar({ shirt })} /></div>
        <div><label className="label">Pants</label><Swatches list={OUTFIT_COLORS} value={avatar.pants} onPick={(pants) => setAvatar({ pants })} /></div>
        <div>
          <label className="label">Cosplay</label>
          <div className="grid grid-cols-3 gap-1">{COSTUME_IDS.filter((c) => !STAFF_COSTUMES.includes(c)).map((c) => { const item = PREMIUM_COSTUMES.includes(c) ? itemById(`costume:${c}`) : null; const locked = !!item && !shop.owned.has(item.id); return <button key={c} title={locked ? `${COSTUMES[c].blurb} · ${item!.coins} coins in the shop` : COSTUMES[c].blurb} onClick={() => { if (locked) { setPanel("shop"); return; } setAvatar({ costume: c }); }} className={`rounded-lg px-1 py-1.5 text-[11px] ${(avatar.costume ?? "none") === c ? "bg-amber-300 text-slate-950 font-semibold" : "bg-white/5"}`}>{locked ? "🔒 " : ""}{COSTUMES[c].name}</button>; })}</div>
          <p className="mt-1 text-[10px] text-slate-500">Original looks only. A costume sets its own outfit colours. 🔒 ones are in the <button className="underline" onClick={() => setPanel("shop")}>shop</button> for coins, or free at a booth that sponsors them.</p>
        </div>
        <OwnModel />
        <div className="hidden">
        </div>
        <button className="btn-primary w-full" onClick={() => { setMode("walk"); setPanel("none"); }}>Walk the floor →</button>
        <p className="text-[11px] text-slate-500">Arrow keys or WASD to walk (left/right arrows turn, A/D sidestep), drag the mouse to look around, Shift to run, E at a booth to open it, V for first person. On phones, use the joystick.</p>
      </div>
    </>
  );
}

/** The name over your head and an optional job title under it. Both live on the account, so guests are sent to sign up. */
function NameAndTitle() {
  const me = useHall((s) => s.me);
  const setMe = useHall((s) => s.setMe);
  const myBooths = useHall((s) => s.myBooths);
  const setPanel = useHall((s) => s.setPanel);
  const setToast = useHall((s) => s.setToast);
  const [name, setName] = useState(me?.displayName ?? "");
  const [title, setTitle] = useState(me?.title ?? "");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setName(me?.displayName ?? ""); setTitle(me?.title ?? ""); }, [me?.displayName, me?.title]);
  const needAccount = () => { setToast("Create a free account to set your name. It takes ten seconds.", () => setPanel("me")); setPanel("me"); };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!me) { needAccount(); return; }
    const n = name.trim(); if (n.length < 2) { setToast("Give yourself a name of at least 2 characters."); return; }
    setBusy(true);
    try { await api("/api/me", { method: "PATCH", body: JSON.stringify({ displayName: n, title: title.trim() }) }); setMe({ ...me, displayName: n, title: title.trim() || null }, myBooths); setToast("Saved. That's what people see over your head."); }
    catch (err) { setToast((err as Error).message); }
    setBusy(false);
  };
  return (
    <form onSubmit={save} className="border-b border-white/8 p-3">
      <label className="label">Your name on the floor</label>
      <div className="flex gap-1.5">
        <input value={me ? name : ""} onChange={(e) => setName(e.target.value.slice(0, 40))} onFocus={() => { if (!me) needAccount(); }} placeholder={me ? "Display name" : "Visitor · sign in to set a name"} readOnly={!me} className="input flex-1 text-sm" />
        <button className="btn-primary text-xs" disabled={busy}>{me ? "Save" : "Sign in"}</button>
      </div>
      <label className="label mt-2">Job title <span className="font-normal normal-case text-slate-500">(optional, shown under your name)</span></label>
      <input value={me ? title : ""} onChange={(e) => setTitle(e.target.value.slice(0, 40))} onFocus={() => { if (!me) needAccount(); }} placeholder={me ? "e.g. Artist · Divinity Comics" : "Create an account to add a title"} readOnly={!me} className="input w-full text-sm" />
      {!me && <p className="mt-1.5 text-[11px] text-slate-400">Names and titles live on your account, so they follow you to any device. <button type="button" onClick={() => setPanel("me")} className="text-amber-300 underline">Create one</button>.</p>}
    </form>
  );
}
