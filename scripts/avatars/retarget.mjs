/**
 * Puts animation onto an avatar body built by mh-to-glb.py and writes the clips into the GLB.
 *
 *   node scripts/avatars/retarget.mjs clips-a.json
 *
 * Spec: {"target": "body.glb", "out": "body.anim.glb", "armsOut": 0,
 *        "sources": [{"file": "take.bvh" | "library.gltf", "map": "cmu_mh" | "ual_mh", "rate": 120,
 *                     "clips": {"walk": {"from": 0.28, "to": 1.27, "loop": true, "travel": "trend"}, "sit": "Sitting_Idle_Loop"}}]}
 *
 * A clip entry is a clip name (glTF sources) or an object:
 *   clip     the source clip's name (glTF sources; a BVH file is one take)
 *   from,to  seconds within the take (default: all of it)
 *   loop     true: the end is eased onto the start so the clip repeats without a seam; "sway": the stretch is played
 *            there and back with eased turns, which loops any calm stretch of standing
 *   travel   what happens to the figure's travel across the floor: "trend" removes the steady advance and keeps the sway
 *            (walk and run cycles, which the hall moves itself), "start" only moves the first frame to the origin
 *            (gestures), "zero" pins the hips over the origin, "keep" leaves it (default "start" for BVH, "keep" for glTF)
 *   face     "travel": the direction walked becomes forward; "front": the way the hips face on average becomes forward
 *   hipsY    seats the figure: the hips are pinned at this height and the legs re-aimed so the feet stay on the floor;
 *            with handsOn "thighs" the hands are laid on the thighs, and knees (0..1) narrows the performer's knee spread
 *   neutral  true: this clip's first frame is the standing pose the gestures below blend from and back to (the idle)
 *   upper    true: only the body above the hips plays; hips and legs hold the neutral pose (a gesture made standing
 *            still, so the feet cannot slide)
 *   intro, outro  seconds over which the clip eases out of / back into the neutral pose
 *   calibrate     a time in the take at which the performer stands upright: spine, neck and head are read as turns
 *                 away from that moment, which cancels a take's own slouch or a skeleton fitted with a tilted head
 *   fingers  {"l": "open" | "point" | "fist" | "relaxed", "r": ...}: the hand shape (captures record no fingers)
 *
 * Method: for every mapped bone the source bone's world rotation, as a turn away from its rest pose, is applied to the
 * target bone's rest pose after a one-off correction that lays the target limb along the source limb's rest direction
 * with its bend axis on the source's (so a T-pose source drives an A-pose target correctly). Rotations only, so the
 * two figures may differ in build. Travel is scaled by leg length. The body is then set down so its lowest foot point
 * (heel, ball or toe) is exactly as far above the floor as the source's, scaled: feet neither sink nor float, and a
 * runner still leaves the ground. Each loop's ground speed is printed: the hall plays it at the figure's real speed.
 */
import fs from "node:fs";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import { Vector3, Quaternion, Matrix4 } from "three";
import { loadBvh } from "./lib/bvh.mjs";
import { DEG, worlds, rotOf, posOf, rigOfDoc } from "./lib/rig.mjs";

const FPS = 30;
const sides = (f) => ["l", "r"].flatMap((l) => f(l, l === "l" ? "Left" : "Right", l.toUpperCase(), l === "l" ? 1 : -1));
const UE_LOWER = new Set(["root", "pelvis", ...["thigh", "calf", "foot", "ball"].flatMap((b) => [`${b}_l`, `${b}_r`])]);
const UE_FEET = [["foot_l", "ball_l", "ball_l_end"], ["foot_r", "ball_r", "ball_r_end"]], UE_LEGS = [["thigh_l", "calf_l", "foot_l"], ["thigh_r", "calf_r", "foot_r"]];
/**
 * Source bone → target bone. dir: [sourceChild, targetChild] is the limb direction to match; hinge: the three joints
 * of the chain on each rig whose bend axis pins the roll about the limb (hingeFallback when a rest limb is dead
 * straight); side: a vector across the bone on each rig (index to pinky), the source's given outright as sideSrc when
 * its rig has no such joints. Bones without dir take the source's movement as it is: both rest poses stand upright
 * with the feet flat.
 */
const MAPS = {
  // CMU Graphics Lab motion capture (BVH: T-pose arms along x with palms down, legs splayed) → the MakeHuman game rig
  cmu_mh: {
    root: "root", hipsSrc: "Hips", hipsTgt: "pelvis", feetSrc: [["LeftFoot", "LeftToeBase", "LeftToeBase_end"], ["RightFoot", "RightToeBase", "RightToeBase_end"]], feetTgt: UE_FEET,
    legsSrc: [["LeftUpLeg", "LeftLeg", "LeftFoot"], ["RightUpLeg", "RightLeg", "RightFoot"]], legsTgt: UE_LEGS, relaxFingers: true,
    calibrated: ["spine_01", "spine_02", "spine_03", "neck_01", "Head"],
    bones: [
      { s: "Hips", t: "pelvis" }, { s: "LowerBack", t: "spine_01" }, { s: "Spine", t: "spine_02" }, { s: "Spine1", t: "spine_03" }, { s: "Neck1", t: "neck_01" }, { s: "Head", t: "Head" },
      ...sides((l, S, _, sign) => { const arm = [`${S}Arm`, `${S}ForeArm`, `${S}Hand`, `upperarm_${l}`, `lowerarm_${l}`, `hand_${l}`], leg = [`${S}UpLeg`, `${S}Leg`, `${S}Foot`, `thigh_${l}`, `calf_${l}`, `foot_${l}`]; return [
        { s: `${S}Shoulder`, t: `clavicle_${l}` },
        { s: `${S}Arm`, t: `upperarm_${l}`, dir: [`${S}ForeArm`, `lowerarm_${l}`], hinge: arm, hingeFallback: [0, -sign, 0] },
        { s: `${S}ForeArm`, t: `lowerarm_${l}`, dir: [`${S}Hand`, `hand_${l}`], hinge: arm, hingeFallback: [0, -sign, 0] },
        // the capture's wrists carry few markers: the hand follows the forearm and takes part of the measured turn
        { s: `${S}Hand`, t: `hand_${l}`, dir: [`${S}HandIndex1`, `middle_01_${l}`], side: [null, null, `index_01_${l}`, `pinky_01_${l}`], sideSrc: [0, 0, -1], damp: 0.6 },
        { s: `${S}UpLeg`, t: `thigh_${l}`, dir: [`${S}Leg`, `calf_${l}`], hinge: leg, hingeFallback: [1, 0, 0] },
        { s: `${S}Leg`, t: `calf_${l}`, dir: [`${S}Foot`, `foot_${l}`], hinge: leg, hingeFallback: [1, 0, 0] },
        { s: `${S}Foot`, t: `foot_${l}` }, { s: `${S}ToeBase`, t: `ball_${l}` },
      ]; }),
    ],
  },
  // Quaternius "Universal Animation Library" (Rigify DEF bones, T-pose) → the MakeHuman game rig
  ual_mh: {
    root: "root", hipsSrc: "DEF-hips", hipsTgt: "pelvis", feetSrc: [["DEF-foot.L", "DEF-toe.L", null], ["DEF-foot.R", "DEF-toe.R", null]], feetTgt: UE_FEET,
    legsSrc: [["DEF-thigh.L", "DEF-shin.L", "DEF-foot.L"], ["DEF-thigh.R", "DEF-shin.R", "DEF-foot.R"]], legsTgt: UE_LEGS,
    bones: [
      { s: "DEF-hips", t: "pelvis" }, { s: "DEF-spine.001", t: "spine_01" }, { s: "DEF-spine.002", t: "spine_02" }, { s: "DEF-spine.003", t: "spine_03" }, { s: "DEF-neck", t: "neck_01" }, { s: "DEF-head", t: "Head" },
      ...sides((l, _, S, sign) => { const arm = [`DEF-upper_arm.${S}`, `DEF-forearm.${S}`, `DEF-hand.${S}`, `upperarm_${l}`, `lowerarm_${l}`, `hand_${l}`], leg = [`DEF-thigh.${S}`, `DEF-shin.${S}`, `DEF-foot.${S}`, `thigh_${l}`, `calf_${l}`, `foot_${l}`]; return [
        { s: `DEF-shoulder.${S}`, t: `clavicle_${l}` },
        { s: `DEF-upper_arm.${S}`, t: `upperarm_${l}`, dir: [`DEF-forearm.${S}`, `lowerarm_${l}`], hinge: arm, hingeFallback: [0, -sign, 0] },
        { s: `DEF-forearm.${S}`, t: `lowerarm_${l}`, dir: [`DEF-hand.${S}`, `hand_${l}`], hinge: arm, hingeFallback: [0, -sign, 0] },
        { s: `DEF-hand.${S}`, t: `hand_${l}`, dir: [`DEF-f_middle.01.${S}`, `middle_01_${l}`], side: [`DEF-f_index.01.${S}`, `DEF-f_pinky.01.${S}`, `index_01_${l}`, `pinky_01_${l}`] },
        ...["index", "middle", "ring", "pinky"].flatMap((f) => [1, 2, 3].map((k) => ({ s: `DEF-f_${f}.0${k}.${S}`, t: `${f}_0${k}_${l}`, ...(k < 3 ? { dir: [`DEF-f_${f}.0${k + 1}.${S}`, `${f}_0${k + 1}_${l}`] } : {}) }))),
        ...[1, 2, 3].map((k) => ({ s: `DEF-thumb.0${k}.${S}`, t: `thumb_0${k}_${l}`, ...(k < 3 ? { dir: [`DEF-thumb.0${k + 1}.${S}`, `thumb_0${k + 1}_${l}`] } : {}) })),
        { s: `DEF-thigh.${S}`, t: `thigh_${l}`, dir: [`DEF-shin.${S}`, `calf_${l}`], hinge: leg, hingeFallback: [1, 0, 0] },
        { s: `DEF-shin.${S}`, t: `calf_${l}`, dir: [`DEF-foot.${S}`, `foot_${l}`], hinge: leg, hingeFallback: [1, 0, 0] },
        { s: `DEF-foot.${S}`, t: `foot_${l}` }, { s: `DEF-toe.${S}`, t: `ball_${l}` },
      ]; }),
    ],
  },
};

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });

/** A glTF animation channel as a function of time. */
function sampler(sm, size) {
  const input = sm.getInput(), output = sm.getOutput(); const n = input.getCount(); const times = []; for (let i = 0; i < n; i++) times.push(input.getElement(i, [])[0]);
  const cubic = sm.getInterpolation() === "CUBICSPLINE", step = sm.getInterpolation() === "STEP";
  const read = (k) => output.getElement(cubic ? k * 3 + 1 : k, []);
  return (t) => {
    if (t <= times[0]) return read(0); if (t >= times[n - 1]) return read(n - 1);
    let i = 1; while (times[i] < t) i++;
    const a = read(i - 1), b = read(i); const f = step ? 0 : (t - times[i - 1]) / (times[i] - times[i - 1]);
    if (size === 4) return new Quaternion(...a).slerp(new Quaternion(...b), f).toArray();
    return a.map((v, k) => v + (b[k] - v) * f);
  };
}
/** A source file as {rig, bvh, take(name) → {dur, pose(t)}}. */
async function loadSource(file, rate) {
  if (/\.bvh$/i.test(file)) { const b = loadBvh(file, rate); return { rig: b.rig, bvh: true, take: () => b }; }
  const doc = await io.read(file); const rig = rigOfDoc(doc); const anims = doc.getRoot().listAnimations();
  return { rig, bvh: false, names: anims.map((a) => a.getName()), take: (name) => {
    const anim = anims.find((a) => a.getName() === name); if (!anim) return null;
    const chans = new Map(); for (const ch of anim.listChannels()) { const n = ch.getTargetNode(); if (!n) continue; const p = ch.getTargetPath(); if (!chans.has(n)) chans.set(n, {}); chans.get(n)[p] = sampler(ch.getSampler(), p === "rotation" ? 4 : 3); }
    let dur = 0; for (const s of anim.listSamplers()) dur = Math.max(dur, s.getInput().getMax([])[0]);
    const pose = (t) => { const local = new Map(); for (const n of rig.nodes) { const r = rig.rest.get(n); const c = chans.get(n); local.set(n, { t: c?.translation ? new Vector3(...c.translation(t)) : r.t, q: c?.rotation ? new Quaternion(...c.rotation(t)) : r.q, s: c?.scale ? new Vector3(...c.scale(t)) : r.s }); } return local; };
    return { dur, pose };
  } };
}

/** The points a foot meets the floor with, as [bone, point in that bone's rest frame]: heel and ball ride the ankle, the toe tip rides the toe joint. */
function contacts(rig, restW, feet) {
  const out = [];
  for (const [ankle, ball, tip] of feet) {
    const A = rig.byName.get(ankle), B = rig.byName.get(ball), E = tip && rig.byName.get(tip); if (!A || !B) continue;
    const a = posOf(restW.get(A)), b = posOf(restW.get(B)), e = E ? posOf(restW.get(E)) : b.clone().add(b.clone().sub(a).setY(0).multiplyScalar(0.5));
    const len = Math.hypot(e.x - a.x, e.z - a.z); const fwd = new Vector3(e.x - a.x, 0, e.z - a.z).normalize();
    const invA = restW.get(A).clone().invert(), invB = restW.get(B).clone().invert();
    out.push([A, new Vector3(a.x, 0, a.z).addScaledVector(fwd, -0.25 * len).applyMatrix4(invA)], [A, new Vector3(b.x, 0, b.z).applyMatrix4(invA)], [B, new Vector3(e.x, 0, e.z).applyMatrix4(invB)]);
  }
  return out;
}
const lowest = (points, w) => Math.min(...points.map(([bone, p]) => p.clone().applyMatrix4(w.get(bone)).y));
const legLength = (rig, restW, legs) => { let s = 0, c = 0; for (const [a, b, d] of legs) { const A = rig.byName.get(a), B = rig.byName.get(b), D = rig.byName.get(d); if (!A || !B || !D) continue; s += posOf(restW.get(A)).distanceTo(posOf(restW.get(B))) + posOf(restW.get(B)).distanceTo(posOf(restW.get(D))); c++; } return c ? s / c : 0; };

/**
 * A relaxed hand for sources that record no fingers: each finger curls a little toward the palm, more toward the
 * little finger, as a hanging hand does. Returns Map(bone → local rotation); the rig's joints are world-aligned at rest.
 */
const HANDS = { // degrees of curl per knuckle, and of the thumb closing toward the index finger
  relaxed: { index: [14, 20, 12], middle: [18, 24, 14], ring: [22, 28, 16], pinky: [26, 32, 18], thumb: [8, 10, 12] },
  open: { index: [2, 4, 2], middle: [2, 4, 2], ring: [3, 5, 3], pinky: [4, 6, 3], thumb: [0, 2, 2] },
  point: { index: [0, 3, 2], middle: [78, 88, 55], ring: [80, 90, 55], pinky: [82, 90, 55], thumb: [28, 30, 35] },
  fist: { index: [74, 86, 52], middle: [78, 88, 55], ring: [80, 90, 55], pinky: [82, 90, 55], thumb: [26, 30, 40] },
};
function relaxedFingers(rig, restW, shapes = {}) {
  const out = new Map(); const P = (n) => { const b = rig.byName.get(n); return b ? posOf(restW.get(b)) : null; };
  for (const [l, sign] of [["l", 1], ["r", -1]]) {
    const { thumb, ...CURL } = HANDS[shapes[l]] ?? HANDS.relaxed;
    const i1 = P(`index_01_${l}`), p1 = P(`pinky_01_${l}`); if (!i1 || !p1) continue; const across = p1.clone().sub(i1);
    for (const [f, deg] of Object.entries(CURL)) {
      const a = P(`${f}_01_${l}`), b = P(`${f}_02_${l}`); if (!a || !b) continue; const d = b.clone().sub(a).normalize();
      const palm = across.clone().cross(d).multiplyScalar(sign).normalize(); const axis = d.clone().cross(palm).normalize(); // turning the finger toward the palm
      deg.forEach((v, k) => { const bone = rig.byName.get(`${f}_0${k + 1}_${l}`); if (bone) out.set(bone, new Quaternion().setFromAxisAngle(axis, v * DEG)); });
    }
    // the thumb closes in toward the index finger
    const t1 = P(`thumb_01_${l}`), t2 = P(`thumb_02_${l}`); if (t1 && t2) { const d = t2.clone().sub(t1).normalize(); const axis = d.clone().cross(i1.clone().sub(t1).normalize()).normalize(); thumb.forEach((v, k) => { const bone = rig.byName.get(`thumb_0${k + 1}_${l}`); if (bone) out.set(bone, new Quaternion().setFromAxisAngle(axis, v * DEG)); }); }
  }
  return out;
}

function retargetClip(src, take, entry, tgtRig, map, spec, neutral) {
  const srcRig = src.rig; const S = (name) => name && srcRig.byName.get(name), T = (name) => name && tgtRig.byName.get(name);
  const t0 = Math.max(0, entry.from ?? 0), t1 = Math.min(take.dur, entry.to ?? take.dur), dur = t1 - t0;
  // "sway": the stretch is played there and back with eased turns (a cosine through it), a seamless loop out of any
  // calm stretch; it lasts pi/2 times the stretch each way so the middle keeps its captured speed
  const sway = entry.loop === "sway"; const length = sway ? Math.PI * dur : dur;
  const frames = Math.max(1, Math.round(length * FPS)); const times = [], at = [];
  for (let i = 0; i <= frames; i++) { times.push((i * length) / frames); at.push(t0 + (sway ? (dur * (1 - Math.cos((2 * Math.PI * i) / frames))) / 2 : (i * dur) / frames)); }
  const srcRestW = worlds(srcRig, srcRig.rest), tgtRestW = worlds(tgtRig, tgtRig.rest);
  const hipsS = S(map.hipsSrc), hipsT = T(map.hipsTgt), rootT = T(map.root);
  const ratio = legLength(tgtRig, tgtRestW, map.legsTgt) / legLength(srcRig, srcRestW, map.legsSrc);
  const P = (r, restW, n) => posOf(restW.get(r.byName.get(n)));
  // per mapped bone: the correction that lays the target bone's rest frame on the source's
  const bones = map.bones.filter((b) => S(b.s) && T(b.t)).map((b) => {
    let corr = new Quaternion();
    if (b.dir && S(b.dir[0]) && T(b.dir[1])) {
      const ds = P(srcRig, srcRestW, b.dir[0]).sub(P(srcRig, srcRestW, b.s)).normalize(), dt = P(tgtRig, tgtRestW, b.dir[1]).sub(P(tgtRig, tgtRestW, b.t)).normalize();
      corr = new Quaternion().setFromUnitVectors(dt, ds);
      let ns = null, nt = null;
      if (b.hinge && b.hinge.every((n, i) => (i < 3 ? S(n) : T(n)))) {
        const [a, m, c, ta, tm, tc] = b.hinge;
        const bend = (r, restW, x, y, z) => { const u = P(r, restW, y).sub(P(r, restW, x)), v = P(r, restW, z).sub(P(r, restW, y)); const n = u.clone().cross(v); return { n, amount: n.length() / (u.length() * v.length()) }; };
        const bs = bend(srcRig, srcRestW, a, m, c), bt = bend(tgtRig, tgtRestW, ta, tm, tc); const fb = b.hingeFallback && new Vector3(...b.hingeFallback);
        // a straight rest limb has no bend to read the axis from (under 2 degrees is noise): use the given axis
        ns = fb && bs.amount < 0.035 ? fb : bs.n; nt = fb && bt.amount < 0.035 ? fb : bt.n;
      } else if (b.side && T(b.side[2]) && T(b.side[3]) && (b.sideSrc || (S(b.side[0]) && S(b.side[1])))) {
        ns = b.sideSrc ? new Vector3(...b.sideSrc) : P(srcRig, srcRestW, b.side[1]).sub(P(srcRig, srcRestW, b.side[0])); nt = P(tgtRig, tgtRestW, b.side[3]).sub(P(tgtRig, tgtRestW, b.side[2]));
      }
      if (ns && nt && ns.lengthSq() > 1e-12 && nt.lengthSq() > 1e-12) {
        const basis = (d, n) => { const y = n.clone().addScaledVector(d, -n.dot(d)).normalize(); const z = d.clone().cross(y); return new Matrix4().makeBasis(d, y, z); };
        corr = new Quaternion().setFromRotationMatrix(basis(ds, ns).multiply(basis(dt, nt).transpose()));
      }
    }
    return { s: S(b.s), t: T(b.t), corr, damp: b.damp ?? 1, sRestInv: rotOf(srcRestW.get(S(b.s))).invert(), tRest: rotOf(tgtRestW.get(T(b.t))) };
  });
  // calibration: these bones turn away from the performer's pose at that moment instead of from the rest pose
  if (entry.calibrate != null && map.calibrated) { const at = worlds(srcRig, take.pose(entry.calibrate)); for (const b of bones) if (map.calibrated.includes(b.t.getName())) b.sRestInv = rotOf(at.get(b.s)).invert(); }
  const lower = entry.upper && neutral ? new Set(tgtRig.nodes.filter((n) => UE_LOWER.has(n.getName()))) : new Set();
  const byT = new Map(bones.map((b) => [b.t, b]));
  const srcPts = contacts(srcRig, srcRestW, map.feetSrc), tgtPts = contacts(tgtRig, tgtRestW, map.feetTgt);
  const fingers = map.relaxFingers ? relaxedFingers(tgtRig, tgtRestW, entry.fingers) : new Map();
  // arms carried a little wider (spec "armsOut", degrees): narrow shoulders over wider hips would brush the thighs
  const out = spec.armsOut ? new Map([["upperarm_l", 1], ["upperarm_r", -1]].map(([n, sign]) => [T(n), new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), DEG * spec.armsOut * sign)])) : new Map();

  // the source poses, turned to face forward
  const poses = at.map((t) => worlds(srcRig, take.pose(t)));
  const hipsAt = poses.map((w) => posOf(w.get(hipsS)));
  let yaw = 0; const face = entry.face ?? (src.bvh ? (entry.travel === "trend" ? "travel" : "front") : null);
  if (face === "travel") { const d = hipsAt[frames].clone().sub(hipsAt[0]); yaw = -Math.atan2(d.x, d.z); }
  else if (face === "front") { const f = new Vector3(); const restInv = rotOf(srcRestW.get(hipsS)).invert(); for (const w of poses) f.add(new Vector3(0, 0, 1).applyQuaternion(rotOf(w.get(hipsS)).multiply(restInv)).setY(0).normalize()); yaw = -Math.atan2(f.x, f.z); }
  const Y = new Matrix4().makeRotationY(yaw); if (yaw) { for (const w of poses) for (const m of w.values()) m.premultiply(Y); hipsAt.forEach((p) => p.applyMatrix4(Y)); }
  if (entry.calibrate != null && yaw) { const qY = new Quaternion().setFromRotationMatrix(Y); for (const b of bones) if (map.calibrated?.includes(b.t.getName())) b.sRestInv.multiply(qY.clone().invert()); }
  // travel across the floor, in source units
  const travel = entry.travel ?? (src.bvh ? "start" : "keep"); const o = travel === "keep" ? posOf(srcRestW.get(hipsS)) : hipsAt[0]; const net = hipsAt[frames].clone().sub(hipsAt[0]);
  const shift = hipsAt.map((p, i) => { const d = p.clone().sub(o); if (travel === "trend") d.addScaledVector(net, -i / frames); if (travel === "zero") d.set(0, 0, 0); return d.setY(0); });

  const tracks = new Map(); // node → {q: number[], t: number[]}
  const put = (n, k, arr) => { if (!tracks.has(n)) tracks.set(n, { q: [], t: [] }); tracks.get(n)[k].push(...arr); };
  const restHips = posOf(tgtRestW.get(hipsT));
  times.forEach((_, i) => {
    const sw = poses[i]; const tl = new Map(), tw = new Map();
    for (const n of tgtRig.nodes) {
      const r = tgtRig.rest.get(n); const b = byT.get(n); let q = fingers.get(n) ?? r.q.clone(), pos = r.t.clone();
      const p = tgtRig.parent.get(n); const pw = p ? tw.get(p) : new Matrix4();
      if (lower.has(n)) { const k = neutral.get(n); if (k) { q = k.q.clone(); pos = k.t.clone(); } }
      else if (b) {
        // the source's turn away from rest (eased by damp, relative to its parent's own turn) · correction · target rest
        let delta = rotOf(sw.get(b.s)).multiply(b.sRestInv);
        if (b.damp !== 1) { const sp = srcRig.parent.get(b.s); const pd = sp ? rotOf(sw.get(sp)).multiply(rotOf(srcRestW.get(sp)).invert()) : new Quaternion(); const rel = pd.clone().invert().multiply(delta); delta = pd.multiply(new Quaternion().slerp(rel, b.damp)); }
        let world = delta.multiply(b.corr).multiply(b.tRest);
        if (out.has(n)) world = out.get(n).clone().multiply(world);
        q = rotOf(pw).invert().multiply(world).normalize();
        if (n === hipsT) pos = new Vector3(restHips.x + shift[i].x * ratio, restHips.y, restHips.z + shift[i].z * ratio).applyMatrix4(pw.clone().invert());
      }
      tl.set(n, { t: pos, q, s: r.s }); tw.set(n, pw.clone().multiply(new Matrix4().compose(pos, q, r.s)));
    }
    // set the body down: the lowest foot point as far above the floor as the source's (scaled), or the hips at a seat height
    if (!lower.size) {
      const dy = entry.hipsY != null ? entry.hipsY - posOf(tw.get(hipsT)).y : ratio * Math.max(0, lowest(srcPts, sw)) - lowest(tgtPts, tw);
      const rl = tl.get(rootT); rl.t = rl.t.clone(); rl.t.y += dy;
    }
    if (entry.hipsY != null) {
      // seated at a given height: the legs are re-aimed so the ankles rest at their standing height, the knees
      // keeping the way they point and the feet their own tilt
      const rebuild = () => { for (const n of tgtRig.nodes) { const l = tl.get(n), p = tgtRig.parent.get(n); tw.set(n, (p ? tw.get(p).clone() : new Matrix4()).multiply(new Matrix4().compose(l.t, l.q, l.s))); } };
      rebuild();
      for (const names of map.legsTgt) {
        const [th, ca, fo] = names.map(T); if (!th || !ca || !fo) continue;
        const a = posOf(tw.get(th)), k = posOf(tw.get(ca)), f = posOf(tw.get(fo)); let footW = rotOf(tw.get(fo));
        // knees: how much of the performer's knee spread is kept (1 = as captured); the feet come round to the front with them
        const keep = entry.knees ?? 1; const pole = k.clone(); pole.x = a.x + (k.x - a.x) * keep; footW = rotOf(tgtRestW.get(fo)).slerp(footW, keep);
        const { mid, end } = reach(a, new Vector3(a.x + (f.x - a.x) * keep, posOf(tgtRestW.get(fo)).y, f.z), a.distanceTo(k), k.distanceTo(f), pole);
        const thW = new Quaternion().setFromUnitVectors(k.clone().sub(a).normalize(), mid.clone().sub(a).normalize()).multiply(rotOf(tw.get(th)));
        const caW = new Quaternion().setFromUnitVectors(f.clone().sub(k).normalize(), end.clone().sub(mid).normalize()).multiply(rotOf(tw.get(ca)));
        tl.get(th).q = rotOf(tw.get(tgtRig.parent.get(th))).invert().multiply(thW).normalize();
        tl.get(ca).q = thW.clone().invert().multiply(caW).normalize();
        tl.get(fo).q = caW.clone().invert().multiply(footW).normalize();
      }
      // and the hands are laid on the thighs (the performer's own lap sat at another height)
      if (entry.handsOn === "thighs") {
        rebuild();
        for (const l of ["l", "r"]) {
          const [up, lo, ha, th, ca] = [`upperarm_${l}`, `lowerarm_${l}`, `hand_${l}`, `thigh_${l}`, `calf_${l}`].map(T); if (!up || !lo || !ha || !th || !ca) continue;
          const a = posOf(tw.get(up)), e = posOf(tw.get(lo)), w = posOf(tw.get(ha)); const handW = rotOf(tw.get(ha));
          const hip = posOf(tw.get(th)), knee = posOf(tw.get(ca)); const on = hip.clone().lerp(knee, 0.58); on.y += 0.3 * (hip.distanceTo(knee) / 1.46);
          const { mid, end } = reach(a, on, a.distanceTo(e), e.distanceTo(w), e);
          const upW = new Quaternion().setFromUnitVectors(e.clone().sub(a).normalize(), mid.clone().sub(a).normalize()).multiply(rotOf(tw.get(up)));
          const loW = new Quaternion().setFromUnitVectors(w.clone().sub(e).normalize(), end.clone().sub(mid).normalize()).multiply(rotOf(tw.get(lo)));
          tl.get(up).q = rotOf(tw.get(tgtRig.parent.get(up))).invert().multiply(upW).normalize();
          tl.get(lo).q = upW.clone().invert().multiply(loW).normalize();
          tl.get(ha).q = loW.clone().invert().multiply(handW).normalize();
        }
      }
    }
    for (const n of tgtRig.nodes) if (byT.get(n) || n === rootT || fingers.has(n)) { const l = tl.get(n); put(n, "q", l.q.toArray()); put(n, "t", l.t.toArray()); }
  });
  if (entry.loop && !sway) closeLoop(tracks, frames);
  // ease out of and back into the neutral pose
  if (neutral && (entry.intro || entry.outro)) {
    const ease = (x) => x * x * (3 - 2 * x);
    for (const [n, tr] of tracks) {
      const k = neutral.get(n) ?? tgtRig.rest.get(n);
      for (let i = 0; i <= frames; i++) {
        const a = entry.intro ? Math.min(1, times[i] / entry.intro) : 1, b = entry.outro ? Math.min(1, (length - times[i]) / entry.outro) : 1; const w = ease(Math.min(a, b)); if (w >= 1) continue;
        k.q.clone().slerp(new Quaternion(tr.q[i * 4], tr.q[i * 4 + 1], tr.q[i * 4 + 2], tr.q[i * 4 + 3]), w).toArray(tr.q, i * 4);
        k.t.clone().lerp(new Vector3(tr.t[i * 3], tr.t[i * 3 + 1], tr.t[i * 3 + 2]), w).toArray(tr.t, i * 3);
      }
    }
  }
  const pace = travel === "trend" ? (Math.hypot(net.x, net.z) * ratio) / dur : 0;
  return { times, tracks, dur: length, pace };
}

/** Two-bone reach: where the middle joint goes for a chain of lengths l1, l2 from `a` to reach `t`, bending toward `pole`. */
function reach(a, t, l1, l2, pole) {
  const dir = t.clone().sub(a); const d = Math.min(l1 + l2 - 1e-4, Math.max(Math.abs(l1 - l2) + 1e-4, dir.length())); dir.normalize();
  const x = (l1 * l1 + d * d - l2 * l2) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  const side = pole.clone().sub(a); side.addScaledVector(dir, -side.dot(dir)); if (side.lengthSq() < 1e-10) side.set(0, 0, 1).addScaledVector(dir, -dir.z); side.normalize();
  return { mid: a.clone().addScaledVector(dir, x).addScaledVector(side, h), end: a.clone().addScaledVector(dir, d) };
}

/** Eases the last frame onto the first: the mismatch between the two ends is spread evenly along the clip. */
function closeLoop(tracks, frames) {
  for (const tr of tracks.values()) {
    const q = (i) => new Quaternion(tr.q[i * 4], tr.q[i * 4 + 1], tr.q[i * 4 + 2], tr.q[i * 4 + 3]);
    const fix = q(0).multiply(q(frames).invert()); const dt = [0, 1, 2].map((k) => tr.t[k] - tr.t[frames * 3 + k]);
    for (let i = 1; i <= frames; i++) {
      const f = i / frames; new Quaternion().slerp(fix, f).multiply(q(i)).normalize().toArray(tr.q, i * 4);
      for (let k = 0; k < 3; k++) tr.t[i * 3 + k] += dt[k] * f;
    }
  }
}

function writeClip(doc, name, { times, tracks }) {
  const root = doc.getRoot(); const buffer = root.listBuffers()[0] ?? doc.createBuffer();
  const anim = doc.createAnimation(name);
  const input = doc.createAccessor(`${name}_t`).setType("SCALAR").setArray(new Float32Array(times)).setBuffer(buffer);
  for (const [node, tr] of tracks) {
    const q = doc.createAccessor().setType("VEC4").setArray(new Float32Array(tr.q)).setBuffer(buffer);
    const sq = doc.createAnimationSampler().setInput(input).setOutput(q).setInterpolation("LINEAR");
    anim.addSampler(sq).addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath("rotation").setSampler(sq));
    // translation only where it moves (root and hips); constant tracks are dropped to keep the file small
    let moves = false; for (let i = 3; i < tr.t.length; i++) if (Math.abs(tr.t[i] - tr.t[i % 3]) > 1e-4) { moves = true; break; }
    if (moves) { const p = doc.createAccessor().setType("VEC3").setArray(new Float32Array(tr.t)).setBuffer(buffer); const sp = doc.createAnimationSampler().setInput(input).setOutput(p).setInterpolation("LINEAR"); anim.addSampler(sp).addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath("translation").setSampler(sp)); }
  }
}

const specPath = process.argv[2]; const spec = JSON.parse(fs.readFileSync(specPath, "utf8")); const base = path.dirname(path.resolve(specPath));
// ${VAR} in a path is an environment variable; by default the source checkouts sit next to this repository
const HERE = path.dirname(new URL(import.meta.url).pathname);
const DEFAULT_ENV = {
  CMU_MOCAP: path.resolve(HERE, "../../../una-dinosauria/cmu-mocap/data"), // una-dinosauria/cmu-mocap
  UAL: path.resolve(HERE, "../../../j-ponzo/gltf-universal-animation-library/glTF"), // J-Ponzo/gltf-universal-animation-library
};
const abs = (p) => { p = p.replace(/\$\{(\w+)\}/g, (m, k) => process.env[k] ?? DEFAULT_ENV[k] ?? m); return path.isAbsolute(p) ? p : path.join(base, p); };
const tgtDoc = await io.read(abs(spec.target)); const tgtRig = rigOfDoc(tgtDoc);
for (const a of tgtDoc.getRoot().listAnimations()) a.dispose();
let neutral = null; // Map(node → {q, t}): the standing pose gestures blend from and to
for (const s of spec.sources) {
  const src = await loadSource(abs(s.file), s.rate); const map = MAPS[s.map]; if (!map) throw new Error(`unknown map ${s.map}`);
  for (const [outName, e] of Object.entries(s.clips)) {
    const entry = typeof e === "string" ? { clip: e } : e; const take = src.take(entry.clip);
    if (!take) { console.warn(`  ${path.basename(s.file)}: no clip ${entry.clip}`); continue; }
    const clip = retargetClip(src, take, entry, tgtRig, map, spec, neutral); writeClip(tgtDoc, outName, clip);
    if (entry.neutral) neutral = new Map([...clip.tracks].map(([n, tr]) => [n, { q: new Quaternion(...tr.q.slice(0, 4)), t: new Vector3(...tr.t.slice(0, 3)) }]));
    console.log(`  ${outName} ← ${path.basename(s.file)}${entry.clip ? `:${entry.clip}` : ""} (${clip.dur.toFixed(2)} s${clip.pace ? `, ${clip.pace.toFixed(2)} ft/s` : ""})`);
  }
}
await io.write(abs(spec.out), tgtDoc);
console.log(`wrote ${spec.out} (${(fs.statSync(abs(spec.out)).size / 1024).toFixed(0)} KB)`);
