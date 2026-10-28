"use client";
import { useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { api, useHall, SKIN_TONES, HAIR_COLORS, OUTFIT_COLORS, type AvatarConfig } from "@/lib/hall/store";
import { AvatarModel } from "../Avatar";
import { PanelHeader } from "./common";
import { COSTUMES, COSTUME_IDS } from "@/lib/hall/costumes";

const HAIR: AvatarConfig["hair"][] = ["short", "long", "buzz", "bun", "curly", "bald"];
function Swatches({ list, value, onPick }: { list: string[]; value: string; onPick: (c: string) => void }) {
  return <div className="flex flex-wrap gap-1.5">{list.map((c) => <button key={c} onClick={() => onPick(c)} className={`h-7 w-7 rounded-full border-2 ${value === c ? "border-white" : "border-transparent"}`} style={{ background: c }} aria-label={c} />)}</div>;
}

/** Pick a body, skin tone, hair and outfit, then walk the floor. Saved locally and on the account. */
export function AvatarPanel() {
  const avatar = useHall((s) => s.avatar);
  const setAvatar = useHall((s) => s.setAvatar);
  const setMode = useHall((s) => s.setMode);
  const setPanel = useHall((s) => s.setPanel);
  const me = useHall((s) => s.me);
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
          <div className="grid grid-cols-6 gap-1">{HAIR.map((h) => <button key={h} onClick={() => setAvatar({ hair: h })} className={`rounded-lg px-1 py-1.5 text-[11px] capitalize ${avatar.hair === h ? "bg-amber-300 text-slate-950 font-semibold" : "bg-white/5"}`}>{h}</button>)}</div>
        </div>
        <div><label className="label">Hair color</label><Swatches list={HAIR_COLORS} value={avatar.hairColor} onPick={(hairColor) => setAvatar({ hairColor })} /></div>
        <div><label className="label">Shirt</label><Swatches list={OUTFIT_COLORS} value={avatar.shirt} onPick={(shirt) => setAvatar({ shirt })} /></div>
        <div><label className="label">Pants</label><Swatches list={OUTFIT_COLORS} value={avatar.pants} onPick={(pants) => setAvatar({ pants })} /></div>
        <div>
          <label className="label">Cosplay</label>
          <div className="grid grid-cols-3 gap-1">{COSTUME_IDS.map((c) => <button key={c} title={COSTUMES[c].blurb} onClick={() => setAvatar({ costume: c })} className={`rounded-lg px-1 py-1.5 text-[11px] ${(avatar.costume ?? "none") === c ? "bg-amber-300 text-slate-950 font-semibold" : "bg-white/5"}`}>{COSTUMES[c].name}</button>)}</div>
          <p className="mt-1 text-[10px] text-slate-500">Original looks only. A costume sets its own outfit colours.</p>
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
