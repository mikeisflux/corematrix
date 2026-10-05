"use client";
/**
 * Procedural avatar: a stylized, rigid-segment character (Kenney style) built
 * from named nodes so animation clips and recoloring work by name. The same
 * builder feeds the GLB exporter (npm run models) and the in-scene fallback.
 *
 * Node names: root, hips, torso, neck, head, face, hair_short, hair_long,
 * hair_buzz, hair_bun, hair_curly, shoulder_l/r, forearm_l/r, hand_l/r,
 * thigh_l/r, shin_l/r, shoe_l/r, badge.
 * Material names: skin, hair, shirt, pants, shoes, face, badge, lanyard.
 */
import * as THREE from "three";

export type BodyType = "a" | "b";
export const AVATAR_HEIGHT = 6.3;

const mat = (name: string, color: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0, ...extra });
  m.name = name;
  return m;
};

function faceTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 256;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, 256, 256);
  // the texture wraps a sphere; the face sits on the +z side (u ≈ 0.25 in three's sphere UVs)
  const cx = 64, cy = 118;
  g.fillStyle = "#1f1410";
  for (const dx of [-18, 18]) { g.beginPath(); g.ellipse(cx + dx, cy, 5.5, 8, 0, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = "#ffffff";
  for (const dx of [-18, 18]) { g.beginPath(); g.arc(cx + dx - 2, cy - 3, 2, 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = "#2a1a12"; g.lineWidth = 3; g.lineCap = "round";
  for (const dx of [-18, 18]) { g.beginPath(); g.moveTo(cx + dx - 9, cy - 16); g.quadraticCurveTo(cx + dx, cy - 21, cx + dx + 9, cy - 16); g.stroke(); }
  g.strokeStyle = "#8b3a3a"; g.lineWidth = 3.5;
  g.beginPath(); g.moveTo(cx - 10, cy + 18); g.quadraticCurveTo(cx, cy + 27, cx + 10, cy + 18); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.flipY = false;
  return t;
}

export function buildAvatar(body: BodyType): THREE.Group {
  const wide = body === "a";
  const shoulder = wide ? 1.15 : 0.95, hip = wide ? 0.9 : 1.05, torsoR = wide ? 0.92 : 0.8;
  const skin = mat("skin", "#c68642"), hair = mat("hair", "#2b1b12", { roughness: 0.6 }), shirt = mat("shirt", "#e63946"), pants = mat("pants", "#1f2a44", { roughness: 0.9 });
  const shoes = mat("shoes", "#1b1b1f", { roughness: 0.5 }), badge = mat("badge", "#f8fafc", { roughness: 0.4 }), lanyard = mat("lanyard", "#111827");
  const face = mat("face", "#ffffff", { map: faceTexture(), transparent: true, roughness: 0.6 });
  const node = (name: string, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.name = name; g.position.set(x, y, z); return g; };
  const mesh = (name: string, geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => { const me = new THREE.Mesh(geo, m); me.name = name; me.position.set(x, y, z); me.castShadow = true; return me; };

  const root = node("root");
  const hips = node("hips", 0, 3.05, 0);
  root.add(hips);

  // legs
  for (const side of ["l", "r"] as const) {
    const sx = side === "l" ? -0.46 : 0.46;
    const thigh = node(`thigh_${side}`, sx * hip, 0, 0);
    thigh.add(mesh(`thigh_${side}_m`, new THREE.CapsuleGeometry(0.37, 1.1, 6, 12), pants, 0, -0.75, 0));
    const shin = node(`shin_${side}`, 0, -1.5, 0);
    shin.add(mesh(`shin_${side}_m`, new THREE.CapsuleGeometry(0.3, 1.0, 6, 12), pants, 0, -0.7, 0));
    const shoe = node(`shoe_${side}`, 0, -1.4, 0.12);
    const shoeGeo = new THREE.BoxGeometry(0.72, 0.34, 1.15); shoeGeo.translate(0, 0, 0.15);
    shoe.add(mesh(`shoe_${side}_m`, shoeGeo, shoes, 0, -0.02, 0));
    shin.add(shoe); thigh.add(shin); hips.add(thigh);
  }
  // torso
  const torso = node("torso", 0, 0.1, 0);
  const torsoGeo = new THREE.CapsuleGeometry(torsoR, 1.5, 8, 16); torsoGeo.scale(shoulder, 1, 0.78);
  torso.add(mesh("torso_m", torsoGeo, shirt, 0, 1.25, 0));
  const hipGeo = new THREE.CylinderGeometry(hip * 0.95, hip * 0.85, 0.7, 16); torso.add(mesh("hip_m", hipGeo, pants, 0, 0.2, 0));
  torso.add(mesh("neck_m", new THREE.CylinderGeometry(0.26, 0.3, 0.5, 10), skin, 0, 2.35, 0));
  // lanyard + badge
  torso.add(mesh("lanyard_l", new THREE.BoxGeometry(0.06, 1.1, 0.04), lanyard, -0.25, 1.75, torsoR * 0.78 + 0.02));
  torso.add(mesh("lanyard_r", new THREE.BoxGeometry(0.06, 1.1, 0.04), lanyard, 0.25, 1.75, torsoR * 0.78 + 0.02));
  torso.add(mesh("badge", new THREE.BoxGeometry(0.62, 0.8, 0.05), badge, 0, 1.05, torsoR * 0.78 + 0.04));
  hips.add(torso);
  // head
  const head = node("head", 0, 2.65, 0);
  const headGeo = new THREE.SphereGeometry(0.74, 24, 18); headGeo.scale(1, 1.08, 0.96);
  head.add(mesh("head_m", headGeo, skin, 0, 0.6, 0));
  const faceGeo = new THREE.SphereGeometry(0.755, 24, 18); faceGeo.scale(1, 1.08, 0.96);
  head.add(mesh("face", faceGeo, face, 0, 0.6, 0));
  for (const s of [-1, 1]) head.add(mesh(`ear_${s < 0 ? "l" : "r"}`, new THREE.SphereGeometry(0.16, 10, 8), skin, s * 0.72, 0.6, 0));
  // hair variants (toggled at runtime)
  const cap = (name: string, r: number, len: number, y: number, z = 0) => { const g = new THREE.SphereGeometry(r, 20, 12, 0, Math.PI * 2, 0, len); const m = mesh(name, g, hair, 0, y, z); return m; };
  head.add(cap("hair_short", 0.79, Math.PI / 2.05, 0.7, -0.06));
  head.add(cap("hair_buzz", 0.765, Math.PI / 2.5, 0.68, -0.02));
  const long = node("hair_long"); long.add(cap("hair_long_cap", 0.8, Math.PI / 1.85, 0.68, -0.04)); const backGeo = new THREE.BoxGeometry(1.35, 1.9, 0.55); backGeo.translate(0, -0.6, 0); long.add(mesh("hair_long_back", backGeo, hair, 0, 0.5, -0.5)); head.add(long);
  const bun = node("hair_bun"); bun.add(cap("hair_bun_cap", 0.79, Math.PI / 2.05, 0.7, -0.06)); bun.add(mesh("hair_bun_ball", new THREE.SphereGeometry(0.34, 12, 10), hair, 0, 1.2, -0.5)); head.add(bun);
  const curly = node("hair_curly"); curly.add(cap("hair_curly_cap", 0.86, Math.PI / 1.95, 0.72, -0.04));
  for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; curly.add(mesh(`hair_curly_${i}`, new THREE.SphereGeometry(0.28, 10, 8), hair, Math.cos(a) * 0.72, 0.95 + Math.sin(i * 2.3) * 0.12, Math.sin(a) * 0.68 - 0.1)); }
  head.add(curly);
  torso.add(head);
  // arms
  for (const side of ["l", "r"] as const) {
    const sx = side === "l" ? -1 : 1;
    const sh = node(`shoulder_${side}`, sx * (torsoR * shoulder + 0.18), 1.95, 0);
    sh.add(mesh(`upperarm_${side}_m`, new THREE.CapsuleGeometry(0.27, 0.9, 6, 12), shirt, 0, -0.62, 0));
    const fa = node(`forearm_${side}`, 0, -1.25, 0);
    fa.add(mesh(`forearm_${side}_m`, new THREE.CapsuleGeometry(0.22, 0.85, 6, 12), skin, 0, -0.55, 0));
    const hand = node(`hand_${side}`, 0, -1.1, 0.02);
    const handGeo = new THREE.SphereGeometry(0.28, 12, 10); handGeo.scale(0.85, 1.05, 0.7);
    hand.add(mesh(`hand_${side}_m`, handGeo, skin, 0, -0.1, 0));
    fa.add(hand); sh.add(fa); torso.add(sh);
  }
  return root;
}

/** Which hair node to show for a hair style; the rest are hidden at runtime. */
export const HAIR_NODES = ["hair_short", "hair_long", "hair_buzz", "hair_bun", "hair_curly"] as const;

const e = (x: number, y = 0, z = 0) => new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z));
function qTrack(node: string, duration: number, samples: number, f: (t: number) => THREE.Quaternion): THREE.QuaternionKeyframeTrack {
  const times: number[] = [], values: number[] = [];
  for (let i = 0; i <= samples; i++) { const t = i / samples; const q = f(t); times.push(t * duration); values.push(q.x, q.y, q.z, q.w); }
  return new THREE.QuaternionKeyframeTrack(`${node}.quaternion`, times, values);
}
function pTrack(node: string, duration: number, samples: number, base: [number, number, number], f: (t: number) => [number, number, number]): THREE.VectorKeyframeTrack {
  const times: number[] = [], values: number[] = [];
  for (let i = 0; i <= samples; i++) { const t = i / samples; const d = f(t); times.push(t * duration); values.push(base[0] + d[0], base[1] + d[1], base[2] + d[2]); }
  return new THREE.VectorKeyframeTrack(`${node}.position`, times, values);
}
const S = (t: number, ph = 0) => Math.sin(t * Math.PI * 2 + ph);

/** idle / walk / run clips keyed to the node names above. Looping, 1 cycle each. */
export function buildAvatarClips(): THREE.AnimationClip[] {
  const gait = (name: string, duration: number, amp: number, lean: number, bob: number) => new THREE.AnimationClip(name, duration, [
    qTrack("thigh_l", duration, 16, (t) => e(S(t) * amp)),
    qTrack("thigh_r", duration, 16, (t) => e(-S(t) * amp)),
    qTrack("shin_l", duration, 16, (t) => e(-Math.max(0, -S(t, 0.8)) * amp * 1.3)),
    qTrack("shin_r", duration, 16, (t) => e(-Math.max(0, S(t, 0.8)) * amp * 1.3)),
    qTrack("shoulder_l", duration, 16, (t) => e(-S(t) * amp * 0.8, 0, 0.12)),
    qTrack("shoulder_r", duration, 16, (t) => e(S(t) * amp * 0.8, 0, -0.12)),
    qTrack("forearm_l", duration, 16, (t) => e(-0.35 - Math.max(0, -S(t)) * amp * 0.6)),
    qTrack("forearm_r", duration, 16, (t) => e(-0.35 - Math.max(0, S(t)) * amp * 0.6)),
    qTrack("torso", duration, 16, (t) => e(lean, S(t) * 0.06, 0)),
    qTrack("head", duration, 16, (t) => e(-lean * 0.6, -S(t) * 0.05, 0)),
    pTrack("hips", duration, 16, [0, 3.05, 0], (t) => [0, Math.abs(S(t * 2)) * bob - bob * 0.5, 0]),
  ]);
  const idle = new THREE.AnimationClip("idle", 3.2, [
    pTrack("hips", 3.2, 16, [0, 3.05, 0], (t) => [0, S(t) * 0.035, 0]),
    qTrack("torso", 3.2, 16, (t) => e(0.02 + S(t) * 0.015, 0, 0)),
    qTrack("head", 3.2, 16, (t) => e(S(t, 1) * 0.04, S(t * 0.5) * 0.12, 0)),
    qTrack("shoulder_l", 3.2, 16, (t) => e(0.05 + S(t) * 0.03, 0, 0.16)),
    qTrack("shoulder_r", 3.2, 16, (t) => e(0.05 - S(t) * 0.03, 0, -0.16)),
    qTrack("forearm_l", 3.2, 16, () => e(-0.3)),
    qTrack("forearm_r", 3.2, 16, () => e(-0.3)),
    qTrack("thigh_l", 3.2, 16, () => e(0)), qTrack("thigh_r", 3.2, 16, () => e(0)), qTrack("shin_l", 3.2, 16, () => e(0)), qTrack("shin_r", 3.2, 16, () => e(0)),
  ]);
  return [idle, gait("walk", 1.0, 0.62, 0.04, 0.09), gait("run", 0.62, 1.0, 0.22, 0.16)];
}
