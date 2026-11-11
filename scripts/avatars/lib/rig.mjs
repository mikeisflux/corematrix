/** Rig helpers shared by the retargeter and the motion probe: a rig is {nodes (parents first), parent, byName, rest}. */
import { Vector3, Quaternion, Matrix4 } from "three";

export const DEG = Math.PI / 180;
export const rotOf = (m) => new Quaternion().setFromRotationMatrix(m).normalize();
export const posOf = (m) => new Vector3().setFromMatrixPosition(m);
/** World matrices of every node for the given local transforms (Map node → {t, q, s}). */
export function worlds(rig, local) {
  const out = new Map();
  for (const n of rig.nodes) { const l = local.get(n); const m = new Matrix4().compose(l.t, l.q, l.s); const p = rig.parent.get(n); out.set(n, p ? out.get(p).clone().multiply(m) : m); }
  return out;
}
/** A rig from a glTF document (gltf-transform). */
export function rigOfDoc(doc) {
  const nodes = doc.getRoot().listNodes();
  const parent = new Map(); nodes.forEach((n) => n.listChildren().forEach((c) => parent.set(c, n)));
  const byName = new Map(nodes.map((n) => [n.getName(), n]));
  const rest = new Map(nodes.map((n) => [n, { t: new Vector3(...n.getTranslation()), q: new Quaternion(...n.getRotation()), s: new Vector3(...n.getScale()) }]));
  const ordered = []; const seen = new Set(); const visit = (n) => { if (seen.has(n)) return; const p = parent.get(n); if (p) visit(p); seen.add(n); ordered.push(n); }; nodes.forEach(visit);
  return { nodes: ordered, parent, byName, rest };
}
/** Smallest angle (radians) between two rotations. */
export const angleBetween = (a, b) => 2 * Math.acos(Math.min(1, Math.abs(a.dot(b))));
