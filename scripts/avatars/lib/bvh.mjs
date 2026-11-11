/**
 * Reads a BVH motion-capture take (the CMU Graphics Lab database in Bruce Hahne's conversion) as a rig plus a pose
 * sampler, the same shape retarget.mjs builds from a glTF file.
 *
 * In that conversion the first frame is an added T-pose standing on the floor (y = 0), which becomes the rig's rest
 * pose; the figure faces +Z with its left side at +X, and lengths are the database's own units (1 unit = 1 / 0.45 inch
 * = 5.644 cm).
 */
import fs from "node:fs";
import { Vector3, Quaternion } from "three";

export const CMU_UNIT_M = 0.0254 / 0.45;
const AXES = { X: new Vector3(1, 0, 0), Y: new Vector3(0, 1, 0), Z: new Vector3(0, 0, 1) };
const ONE = new Vector3(1, 1, 1);

/** rate: frames per second, for takes whose file states the wrong one (the later CMU subjects were captured at 60). */
export function loadBvh(file, rate) {
  const text = fs.readFileSync(file, "utf8"); const at = text.indexOf("MOTION"); if (at < 0) throw new Error(`${file}: not a BVH file`);
  const nodes = [], parent = new Map(), rest = new Map(), byName = new Map(), layout = []; // layout: [{node, kinds}] in channel order
  const stack = []; let pending = null;
  for (const raw of text.slice(0, at).split("\n")) {
    const w = raw.trim().split(/\s+/); if (!w[0]) continue;
    if (w[0] === "ROOT" || w[0] === "JOINT") pending = { name: w[1] };
    else if (w[0] === "End") pending = { name: `${stack[stack.length - 1].name}_end`, end: true };
    else if (w[0] === "{") { const n = pending; const p = stack[stack.length - 1]; nodes.push(n); byName.set(n.name, n); if (p) parent.set(n, p); stack.push(n); }
    else if (w[0] === "}") stack.pop();
    else if (w[0] === "OFFSET") rest.set(stack[stack.length - 1], { t: new Vector3(+w[1], +w[2], +w[3]), q: new Quaternion(), s: ONE });
    else if (w[0] === "CHANNELS") layout.push({ node: stack[stack.length - 1], kinds: w.slice(2, 2 + Number(w[1])) });
  }
  const lines = text.slice(at).split("\n"); const count = Number(lines[1].split(":")[1]), dt = rate ? 1 / rate : Number(lines[2].split(":")[1]);
  const width = layout.reduce((n, l) => n + l.kinds.length, 0); const data = new Float32Array(count * width);
  for (let f = 0; f < count; f++) { const v = lines[3 + f].trim().split(/\s+/); for (let k = 0; k < width; k++) data[f * width + k] = Number(v[k]); }
  const frames = new Map(); // frame index → Map(node → {t, q, s})
  const frame = (f) => {
    let pose = frames.get(f); if (pose) return pose; pose = new Map(); let k = f * width;
    for (const { node, kinds } of layout) {
      const r = rest.get(node); const t = r.t.clone(); const q = new Quaternion();
      for (const kind of kinds) { const v = data[k++]; if (kind.endsWith("position")) t[kind[0].toLowerCase()] = v; else q.multiply(new Quaternion().setFromAxisAngle(AXES[kind[0]], (v * Math.PI) / 180)); }
      pose.set(node, { t, q, s: ONE });
    }
    for (const n of nodes) if (!pose.has(n)) pose.set(n, rest.get(n));
    frames.set(f, pose); return pose;
  };
  // The rest pose is the T-pose frame, not the skeleton's zero pose: the conversion set it up as the reference for
  // retargeting (legs brought upright from the skeleton's 20 degree splay with the feet flat, the neck and head level).
  const root = nodes[0]; const tpose = frame(0); frames.delete(0);
  for (const n of nodes) { const p = tpose.get(n); rest.set(n, { t: n === root ? new Vector3(0, p.t.y, 0) : p.t.clone(), q: p.q.clone(), s: ONE }); }
  /** The pose at time t (seconds from the first captured frame; the added T-pose is skipped). */
  const pose = (t) => {
    const x = Math.min(count - 1, Math.max(1, 1 + t / dt)); const i = Math.floor(x), j = Math.min(count - 1, i + 1), a = x - i;
    if (a < 1e-6 || i === j) return frame(i);
    const A = frame(i), B = frame(j); const out = new Map();
    for (const n of nodes) { const p = A.get(n), q = B.get(n); out.set(n, p === q ? p : { t: p.t.clone().lerp(q.t, a), q: p.q.clone().slerp(q.q, a), s: ONE }); }
    return out;
  };
  return { rig: { nodes, parent, byName, rest }, dur: (count - 2) * dt, dt, pose };
}
