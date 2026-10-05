"use client";
import { useEffect } from "react";
import { Canvas } from "@react-three/fiber";
import { api, useHall, SKIN_TONES, HAIR_COLORS, OUTFIT_COLORS, type AvatarConfig } from "@/lib/hall/store";
import { AvatarModel } from "../Avatar";
import { PanelHeader } from "./common";

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
        <button className="btn-primary w-full" onClick={() => { setMode("walk"); setPanel("none"); }}>Walk the floor →</button>
        <p className="text-[11px] text-slate-500">WASD / arrows to walk, Shift to run, Q to turn, E at a booth to open it, V for first person. On phones, use the joystick.</p>
      </div>
    </>
  );
}
