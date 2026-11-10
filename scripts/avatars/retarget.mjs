/**
 * Retargets animation clips from one humanoid rig onto another and writes them into the target GLB.
 *
 *   node scripts/avatars/retarget.mjs spec.json
 *
 * Spec: {"target": "body.glb", "out": "body-animated.glb", "sources": [{"file": "Rogue.glb", "map": "kaykit",
 *        "clips": {"walk": "Walking_A", ...} | "all", "inPlace": true}]}
 *
 * Method: for every mapped bone the source bone's world rotation delta from its rest pose is applied to the target
 * bone's rest world rotation, after a one-off correction that turns the target limb onto the source limb's rest
 * direction (so a slightly bent source knee reads as bent on the target too). Rotations only, so the two figures may
 * have different proportions. Root/hips translation is scaled by the ratio of hip heights. Target bones with no
 * source stay at rest. The Quaternius rig keeps its feet as children of the root (IK targets): a foot is placed at the
 * end of its lower leg every frame.
 */
import fs from "node:fs";
import path from "node:path";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import { Vector3, Quaternion, Matrix4 } from "three";

const FPS = 30;
/** Source bone → target bone. dir: [sourceChild, targetChild] gives the limb direction to match. */
const MAPS = {
  // KayKit "Adventurers" rig → Quaternius "Ultimate Animated Character" rig
  kaykit: {
    root: "Bone", hipsSrc: "hips", hipsTgt: "Body",
    bones: [
      { s: "hips", t: "Body" }, { s: "spine", t: "Abdomen" }, { s: "chest", t: "Torso" }, { s: "head", t: "Head" },
      // damp: the KayKit figures are chibi (short forearms and shins), so their elbows and knees bend further than
      // reads well on longer limbs; the delta is eased back by this factor
      { s: "upperarm.l", t: "UpperArm_L", dir: ["lowerarm.l", "LowerArm_L"] }, { s: "lowerarm.l", t: "LowerArm_L", dir: ["wrist.l", "Fist_L"], damp: 0.6 }, { s: "hand.l", t: "Fist_L", dir: ["handslot.l", "Fist_L_end"] },
      { s: "upperarm.r", t: "UpperArm_R", dir: ["lowerarm.r", "LowerArm_R"] }, { s: "lowerarm.r", t: "LowerArm_R", dir: ["wrist.r", "Fist_R"], damp: 0.6 }, { s: "hand.r", t: "Fist_R", dir: ["handslot.r", "Fist_R_end"] },
      { s: "upperleg.l", t: "UpperLeg_L", dir: ["lowerleg.l", "LowerLeg_L"] }, { s: "lowerleg.l", t: "LowerLeg_L", dir: ["foot.l", "LowerLeg_L_end"], damp: 0.7 }, { s: "foot.l", t: "Foot_L", dir: ["toes.l", "Foot_L_end"], footOf: "LowerLeg_L", damp: 0.7 },
      { s: "upperleg.r", t: "UpperLeg_R", dir: ["lowerleg.r", "LowerLeg_R"] }, { s: "lowerleg.r", t: "LowerLeg_R", dir: ["foot.r", "LowerLeg_R_end"], damp: 0.7 }, { s: "foot.r", t: "Foot_R", dir: ["toes.r", "Foot_R_end"], footOf: "LowerLeg_R", damp: 0.7 },
    ],
  },
  // the project's old rigid-part avatar (src/lib/hall/modelkit/avatar.ts) → Quaternius rig; its parts are world-aligned at rest
  legacy: {
    root: "Bone", hipsSrc: "hips", hipsTgt: "Body",
    bones: [
      { s: "hips", t: "Body" }, { s: "torso", t: "Torso" }, { s: "head", t: "Head" },
      // its "_l" parts sit at negative x (the figure's right), so sides swap here; its arms hang at rest while the Quaternius rig stands in a T-pose, so the limbs are direction-matched
      { s: "shoulder_l", t: "UpperArm_R", dir: ["forearm_l", "LowerArm_R"] }, { s: "forearm_l", t: "LowerArm_R", dir: ["hand_l", "Fist_R"] }, { s: "hand_l", t: "Fist_R" },
      { s: "shoulder_r", t: "UpperArm_L", dir: ["forearm_r", "LowerArm_L"] }, { s: "forearm_r", t: "LowerArm_L", dir: ["hand_r", "Fist_L"] }, { s: "hand_r", t: "Fist_L" },
      { s: "thigh_l", t: "UpperLeg_R", dir: ["shin_l", "LowerLeg_R"] }, { s: "shin_l", t: "LowerLeg_R", dir: ["shoe_l", "LowerLeg_R_end"] }, { s: "shoe_l", t: "Foot_R", footOf: "LowerLeg_R" },
      { s: "thigh_r", t: "UpperLeg_L", dir: ["shin_r", "LowerLeg_L"] }, { s: "shin_r", t: "LowerLeg_L", dir: ["shoe_r", "LowerLeg_L_end"] }, { s: "shoe_r", t: "Foot_L", footOf: "LowerLeg_L" },
    ],
  },
};

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });

function rig(doc) {
  const nodes = doc.getRoot().listNodes();
  const parent = new Map(); nodes.forEach((n) => n.listChildren().forEach((c) => parent.set(c, n)));
  const byName = new Map(nodes.map((n) => [n.getName(), n]));
  const rest = new Map(nodes.map((n) => [n, { t: new Vector3(...n.getTranslation()), q: new Quaternion(...n.getRotation()), s: new Vector3(...n.getScale()) }]));
  // parents before children
  const ordered = []; const visit = (n) => { if (ordered.includes(n)) return; const p = parent.get(n); if (p) visit(p); ordered.push(n); }; nodes.forEach(visit);
  return { nodes: ordered, parent, byName, rest };
}
function worlds(r, local) {
  const out = new Map();
  for (const n of r.nodes) { const l = local.get(n); const m = new Matrix4().compose(l.t, l.q, l.s); const p = r.parent.get(n); out.set(n, p ? out.get(p).clone().multiply(m) : m); }
  return out;
}
const rotOf = (m) => new Quaternion().setFromRotationMatrix(m).normalize();
const posOf = (m) => new Vector3().setFromMatrixPosition(m);

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

function retargetClip(srcDoc, srcRig, anim, tgtRig, map, opts) {
  const chans = new Map(); // node → {translation, rotation, scale}
  for (const ch of anim.listChannels()) { const n = ch.getTargetNode(); if (!n) continue; const p = ch.getTargetPath(); if (!chans.has(n)) chans.set(n, {}); chans.get(n)[p] = sampler(ch.getSampler(), p === "rotation" ? 4 : 3); }
  let dur = 0; for (const s of anim.listSamplers()) dur = Math.max(dur, s.getInput().getMax([])[0]);
  const frames = Math.max(1, Math.round(dur * FPS)); const times = []; for (let i = 0; i <= frames; i++) times.push(Math.min(dur, i / FPS));
  const S = (name) => srcRig.byName.get(name), T = (name) => tgtRig.byName.get(name);
  const srcRestW = worlds(srcRig, srcRig.rest), tgtRestW = worlds(tgtRig, tgtRig.rest);
  const hipsS = S(map.hipsSrc), hipsT = T(map.hipsTgt);
  const ratio = posOf(tgtRestW.get(hipsT)).y / Math.max(1e-6, posOf(srcRestW.get(hipsS)).y);
  // per mapped bone: the correction turning the target limb onto the source limb direction (identity when no dir)
  const bones = map.bones.filter((b) => S(b.s) && T(b.t)).map((b) => {
    let corr = new Quaternion();
    if (b.dir && S(b.dir[0]) && T(b.dir[1])) {
      const ds = posOf(srcRestW.get(S(b.dir[0]))).sub(posOf(srcRestW.get(S(b.s)))).normalize();
      const dt = posOf(tgtRestW.get(T(b.dir[1]))).sub(posOf(tgtRestW.get(T(b.t)))).normalize();
      corr = new Quaternion().setFromUnitVectors(dt, ds);
    }
    return { s: S(b.s), t: T(b.t), corr, damp: b.damp ?? 1, footOf: b.footOf ? T(b.footOf) : null, sRestInv: rotOf(srcRestW.get(S(b.s))).invert(), tRest: rotOf(tgtRestW.get(T(b.t))) };
  });
  const byT = new Map(bones.map((b) => [b.t, b]));
  const rootT = T(map.root), rootS = S("root") ?? srcRig.nodes[0];
  const tracks = new Map(); // node → {q: number[], t: number[]}
  const put = (n, k, arr) => { if (!tracks.has(n)) tracks.set(n, { q: [], t: [] }); tracks.get(n)[k].push(...arr); };
  for (const t of times) {
    // source pose
    const local = new Map(); for (const n of srcRig.nodes) { const r = srcRig.rest.get(n); const c = chans.get(n); local.set(n, { t: c?.translation ? new Vector3(...c.translation(t)) : r.t, q: c?.rotation ? new Quaternion(...c.rotation(t)) : r.q, s: c?.scale ? new Vector3(...c.scale(t)) : r.s }); }
    const sw = worlds(srcRig, local);
    // target pose, parents first
    const tl = new Map(); const tw = new Map();
    // feet hang off the root but are placed from the lower legs, so they go after everything else
    const underFoot = (n) => { for (let m = n; m; m = tgtRig.parent.get(m)) if (byT.get(m)?.footOf) return true; return false; };
    const order = [...tgtRig.nodes.filter((n) => !underFoot(n)), ...tgtRig.nodes.filter(underFoot)];
    for (const n of order) {
      const r = tgtRig.rest.get(n); const b = byT.get(n); let q = r.q.clone(), pos = r.t.clone();
      const p = tgtRig.parent.get(n); const pw = p ? tw.get(p) : new Matrix4();
      if (b) {
        // Δsource (eased by damp, as a rotation relative to the parent's own delta so a bent elbow eases, not the whole arm) · correction · target rest
        let delta = rotOf(sw.get(b.s)).multiply(b.sRestInv);
        if (b.damp !== 1) { const sp = srcRig.parent.get(b.s); const pd = sp ? rotOf(sw.get(sp)).multiply(rotOf(srcRestW.get(sp)).invert()) : new Quaternion(); const rel = pd.clone().invert().multiply(delta); delta = pd.multiply(new Quaternion().slerp(rel, b.damp)); }
        const world = delta.multiply(b.corr).multiply(b.tRest);
        q = rotOf(pw).invert().multiply(world).normalize();
        if (b.s === hipsS) { const d = local.get(hipsS).t.clone().sub(srcRig.rest.get(hipsS).t).multiplyScalar(ratio); if (opts.inPlace) { d.x = 0; d.z = 0; } pos.add(d); }
        if (b.footOf) { const legRestInv = tgtRestW.get(b.footOf).clone().invert(); const off = posOf(tgtRestW.get(n)).applyMatrix4(legRestInv); const wp = off.applyMatrix4(tw.get(b.footOf)); pos = wp.applyMatrix4(pw.clone().invert()); }
      } else if (n === rootT && rootS && local.get(rootS)) {
        const d = local.get(rootS).t.clone().sub(srcRig.rest.get(rootS).t).multiplyScalar(ratio); if (opts.inPlace) { d.x = 0; d.z = 0; } pos.add(d);
        q = local.get(rootS).q.clone().multiply(srcRig.rest.get(rootS).q.clone().invert()).multiply(r.q);
      }
      tl.set(n, { t: pos, q, s: r.s }); tw.set(n, pw.clone().multiply(new Matrix4().compose(pos, q, r.s)));
    }
    if (opts.ground !== false) {
      // keep the lowest foot on the floor: longer legs lift a foot higher for the same thigh swing than the source did
      const feet = tgtRig.nodes.filter((n) => /^Foot_[LR](_end)?$/.test(n.getName()));
      if (feet.length) {
        const low = Math.min(...feet.map((n) => posOf(tw.get(n)).y)), restLow = Math.min(...feet.map((n) => posOf(tgtRestW.get(n)).y));
        const dy = restLow - low; const rl = tl.get(rootT); rl.t = rl.t.clone(); rl.t.y += dy;
      }
    }
    if (opts.hipsY != null) { const dy = opts.hipsY - posOf(tw.get(hipsT)).y; const rl = tl.get(rootT); rl.t = rl.t.clone(); rl.t.y += dy; }
    for (const n of order) if (byT.get(n) || n === rootT) { const l = tl.get(n); put(n, "q", l.q.toArray()); put(n, "t", l.t.toArray()); }
  }
  return { times, tracks, dur };
}

function writeClip(doc, name, { times, tracks }) {
  const root = doc.getRoot(); const buffer = root.listBuffers()[0] ?? doc.createBuffer();
  const anim = doc.createAnimation(name);
  const input = doc.createAccessor(`${name}_t`).setType("SCALAR").setArray(new Float32Array(times)).setBuffer(buffer);
  for (const [node, tr] of tracks) {
    const q = doc.createAccessor().setType("VEC4").setArray(new Float32Array(tr.q)).setBuffer(buffer);
    const sq = doc.createAnimationSampler().setInput(input).setOutput(q).setInterpolation("LINEAR");
    anim.addSampler(sq).addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath("rotation").setSampler(sq));
    // translation only where it moves (hips bob, feet); constant tracks are dropped to keep the file small
    let moves = false; for (let i = 3; i < tr.t.length; i++) if (Math.abs(tr.t[i] - tr.t[i % 3]) > 1e-4) { moves = true; break; }
    if (moves) { const p = doc.createAccessor().setType("VEC3").setArray(new Float32Array(tr.t)).setBuffer(buffer); const sp = doc.createAnimationSampler().setInput(input).setOutput(p).setInterpolation("LINEAR"); anim.addSampler(sp).addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath("translation").setSampler(sp)); }
  }
}

const specPath = process.argv[2]; const spec = JSON.parse(fs.readFileSync(specPath, "utf8")); const base = path.dirname(path.resolve(specPath));
// ${VAR} in a path is an environment variable (KAYKIT_ADVENTURERS: the clone of KayKit-Game-Assets/KayKit-Character-Pack-Adventures-1.0)
const DEFAULT_ENV = { KAYKIT_ADVENTURERS: path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../../kaykit-game-assets/kaykit-character-pack-adventures-1.0") }; // cloned next to this repository
const abs = (p) => { p = p.replace(/\$\{(\w+)\}/g, (m, k) => process.env[k] ?? DEFAULT_ENV[k] ?? m); return path.isAbsolute(p) ? p : path.join(base, p); };
const tgtDoc = await io.read(abs(spec.target)); const tgtRig = rig(tgtDoc);
for (const a of tgtDoc.getRoot().listAnimations()) a.dispose();
for (const src of spec.sources) {
  const srcDoc = await io.read(abs(src.file)); const srcRig = rig(srcDoc); const map = MAPS[src.map];
  const anims = srcDoc.getRoot().listAnimations();
  const wanted = src.clips === "all" ? Object.fromEntries(anims.map((a) => [a.getName(), a.getName()])) : src.clips;
  for (const [outName, entry] of Object.entries(wanted)) {
    // an entry is a clip name, or {clip, ground, inPlace, hipsY}: hipsY pins the hips to that height (a chair's seat), no grounding
    const e = typeof entry === "string" ? { clip: entry } : entry; const inName = e.clip;
    const anim = anims.find((a) => a.getName() === inName); if (!anim) { console.warn(`  ${src.file}: no clip ${inName}`); continue; }
    const clip = retargetClip(srcDoc, srcRig, anim, tgtRig, map, { inPlace: e.inPlace ?? src.inPlace !== false, ground: e.hipsY != null ? false : e.ground ?? src.ground !== false, hipsY: e.hipsY });
    writeClip(tgtDoc, outName, clip); console.log(`  ${outName} ← ${path.basename(src.file)}:${inName} (${clip.dur.toFixed(2)}s)`);
  }
}
await io.write(abs(spec.out), tgtDoc);
console.log(`wrote ${spec.out} (${(fs.statSync(abs(spec.out)).size / 1024).toFixed(0)} KB)`);
