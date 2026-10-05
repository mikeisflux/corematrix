"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { buildAvatar, buildAvatarClips, HAIR_NODES } from "@/lib/hall/modelkit/avatar";
import { PROP_BUILDERS } from "@/lib/hall/modelkit/props";

type Export = Record<string, string>; // name -> base64 glb

async function exportGlb(obj: THREE.Object3D, animations: THREE.AnimationClip[] = []): Promise<string> {
  const buf = (await new GLTFExporter().parseAsync(obj, { binary: true, animations, trs: true })) as ArrayBuffer;
  let s = ""; const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

async function exportAll(): Promise<Export> {
  const out: Export = {};
  const clips = buildAvatarClips();
  for (const body of ["a", "b"] as const) out[`avatar-${body}`] = await exportGlb(buildAvatar(body), clips);
  for (const [name, build] of Object.entries(PROP_BUILDERS)) out[name] = await exportGlb(build());
  return out;
}

function Preview({ body, hair, clip }: { body: "a" | "b"; hair: string; clip: string }) {
  const model = useMemo(() => buildAvatar(body), [body]);
  const clips = useMemo(() => buildAvatarClips(), []);
  const mixer = useMemo(() => new THREE.AnimationMixer(model), [model]);
  useEffect(() => { model.traverse((o) => { if ((HAIR_NODES as readonly string[]).includes(o.name)) o.visible = o.name === `hair_${hair}`; }); }, [model, hair]);
  useEffect(() => { mixer.stopAllAction(); const c = clips.find((x) => x.name === clip); if (c) mixer.clipAction(c).play(); }, [mixer, clips, clip]);
  useFrame((_, dt) => mixer.update(dt));
  return <primitive object={model} />;
}

export function ModelExporter() {
  const [status, setStatus] = useState("idle");
  const [body, setBody] = useState<"a" | "b">("a");
  const [hair, setHair] = useState("short");
  const [clip, setClip] = useState("walk");
  const [prop, setProp] = useState("table");
  const propObj = useMemo(() => PROP_BUILDERS[prop]?.(), [prop]);
  const done = useRef(false);
  useEffect(() => {
    (window as unknown as { __exportModels: () => Promise<Export> }).__exportModels = async () => { setStatus("exporting…"); const r = await exportAll(); setStatus(`exported ${Object.keys(r).length} models`); done.current = true; return r; };
  }, []);
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", height: "100vh", background: "#0b0f1a", color: "#fff", fontFamily: "sans-serif" }}>
      <div style={{ position: "relative" }}>
        <Canvas camera={{ position: [0, 5, 14], fov: 35 }} shadows>
          <color attach="background" args={["#1b1f2a"]} />
          <ambientLight intensity={0.7} /><directionalLight position={[5, 10, 6]} intensity={1.5} castShadow />
          <gridHelper args={[20, 20, "#334155", "#1f2937"]} />
          <Preview body={body} hair={hair} clip={clip} />
          <OrbitControls target={[0, 3.2, 0]} />
        </Canvas>
        <div style={{ position: "absolute", left: 12, top: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {(["a", "b"] as const).map((b) => <button key={b} onClick={() => setBody(b)} style={{ fontWeight: body === b ? 700 : 400 }}>body {b}</button>)}
          {["short", "long", "buzz", "bun", "curly", "bald"].map((h) => <button key={h} onClick={() => setHair(h)} style={{ fontWeight: hair === h ? 700 : 400 }}>{h}</button>)}
          {["idle", "walk", "run"].map((c) => <button key={c} onClick={() => setClip(c)} style={{ fontWeight: clip === c ? 700 : 400 }}>{c}</button>)}
        </div>
      </div>
      <div style={{ position: "relative" }}>
        <Canvas camera={{ position: [6, 6, 10], fov: 35 }} shadows>
          <color attach="background" args={["#1b1f2a"]} />
          <ambientLight intensity={0.7} /><directionalLight position={[5, 10, 6]} intensity={1.5} castShadow />
          <gridHelper args={[20, 20, "#334155", "#1f2937"]} />
          {propObj && <primitive object={propObj} />}
          <OrbitControls target={[0, 2.5, 0]} />
        </Canvas>
        <div style={{ position: "absolute", left: 12, top: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
          {Object.keys(PROP_BUILDERS).map((p) => <button key={p} onClick={() => setProp(p)} style={{ fontWeight: prop === p ? 700 : 400 }}>{p}</button>)}
          <button onClick={() => (window as unknown as { __exportModels: () => Promise<Export> }).__exportModels().then((r) => { for (const [n, b64] of Object.entries(r)) { const a = document.createElement("a"); a.href = `data:model/gltf-binary;base64,${b64}`; a.download = `${n}.glb`; a.click(); } })}>download all .glb</button>
          <span>{status}</span>
        </div>
      </div>
    </div>
  );
}
