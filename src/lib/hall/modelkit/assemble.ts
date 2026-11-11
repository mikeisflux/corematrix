"use client";
/**
 * Assembles the hall's avatar GLBs (npm run models, via /dev/models) from two sources:
 *
 *  - the skinned, animated body in models-src/body-{a,b}.anim.glb: a MakeHuman adult (CC0) with fitted clothes, shoes
 *    and five hair styles, built by scripts/avatars/mh-to-glb.py, carrying motion-capture clips (CMU Graphics Lab
 *    database) retargeted by scripts/avatars/retarget.mjs;
 *  - the costume parts, badge and lanyard of the procedural figure in ./avatar.ts (node names cos_*, badge, lanyard_m),
 *    which are lifted off that figure and refit onto the new bones: head parts scaled to the new head, chest parts to
 *    the new torso, carried props into the hand. The runtime (applyAvatarLook) keeps toggling them by name.
 *
 * It also bakes a low-detail copy of the body in its idle pose ("lod": one plain mesh with a _part attribute telling
 * skin from shirt from pants…) that the far crowd draws as instances instead of a skinned rig each.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries, mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { buildAvatar, type BodyType } from "./avatar";

// the procedural head (avatar.ts): a sphere of these radii centred HC above the head node
const OLD_HEAD_C = new THREE.Vector3(0, 0.62, 0), OLD_HEAD_R = new THREE.Vector3(0.7, 0.7 * 1.08, 0.7 * 0.96);

/** Ids written into the LOD mesh's _part attribute (stored as id / 8 so quantization keeps them exact). */
export const LOD_PARTS = { skin: 0, shirt: 1, pants: 2, hair: 3, shoes: 4, dark: 5 } as const;
const LOD_PART_OF: Record<string, number> = { skin: 0, shirt: 1, pants: 2, hair: 3, brow: 3, shoes: 4, belt: 5, eye: 5 };

/** Bounding box of the vertices of every mesh under `root` with this material name that pass `pred` (world space). */
function measure(root: THREE.Object3D, material: string, pred: (v: THREE.Vector3) => boolean): THREE.Box3 {
  const box = new THREE.Box3(); const v = new THREE.Vector3();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const m = o as THREE.Mesh; if (!m.isMesh || (m.material as THREE.Material).name !== material) return;
    const pos = m.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld); if (pred(v)) box.expandByPoint(v); }
  });
  return box;
}

/** A group on a bone whose axes line up with the world at rest, so parts built in world-aligned space keep their orientation. */
function holder(bone: THREE.Object3D, name: string, extra?: THREE.Quaternion): THREE.Group {
  const g = new THREE.Group(); g.name = name;
  const wq = new THREE.Quaternion(); bone.getWorldQuaternion(wq);
  g.quaternion.copy(wq.invert()); if (extra) g.quaternion.multiply(extra);
  bone.add(g); return g;
}

/** Moves the costume meshes (cos_*, badge, lanyard_m) from an old parent into `into`, keeping names and materials. */
function lift(from: THREE.Object3D, into: THREE.Object3D) {
  for (const c of [...from.children]) {
    if (!(c as THREE.Mesh).isMesh) continue;
    if (c.name.startsWith("cos_") || c.name === "badge" || c.name === "lanyard_m") into.add(c);
  }
}

/**
 * The front of a set of meshes as a height field: for a point (x, y), the largest z any of their triangles reaches
 * over it (world space, rest pose), or null where there is none.
 */
function frontOf(meshes: THREE.Mesh[], cell = 0.02): (x: number, y: number) => number | null {
  const tris: number[] = []; const box = new THREE.Box3(); const v = new THREE.Vector3();
  for (const m of meshes) {
    const pos = m.geometry.attributes.position, idx = m.geometry.index; const n = idx ? idx.count : pos.count;
    for (let i = 0; i < n; i++) { v.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(m.matrixWorld); box.expandByPoint(v); tris.push(v.x, v.y, v.z); }
  }
  if (!tris.length) return () => null;
  const nx = Math.ceil((box.max.x - box.min.x) / cell) + 1, ny = Math.ceil((box.max.y - box.min.y) / cell) + 1; const grid = new Float32Array(nx * ny).fill(-Infinity);
  for (let t = 0; t < tris.length; t += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = tris.slice(t, t + 9); const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy); if (Math.abs(den) < 1e-12) continue;
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - box.min.x) / cell)), i1 = Math.min(nx - 1, Math.ceil((Math.max(ax, bx, cx) - box.min.x) / cell));
    const j0 = Math.max(0, Math.floor((Math.min(ay, by, cy) - box.min.y) / cell)), j1 = Math.min(ny - 1, Math.ceil((Math.max(ay, by, cy) - box.min.y) / cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = box.min.x + i * cell, y = box.min.y + j * cell;
      const u = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / den, w = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / den, q = 1 - u - w;
      if (u < -0.02 || w < -0.02 || q < -0.02) continue; // a hair outside still counts: no pinholes between triangles
      const z = u * az + w * bz + q * cz; if (z > grid[j * nx + i]) grid[j * nx + i] = z;
    }
  }
  return (x, y) => {
    const i = Math.round((x - box.min.x) / cell), j = Math.round((y - box.min.y) / cell); if (i < 0 || j < 0 || i >= nx || j >= ny) return null;
    const z = grid[j * nx + i]; return z === -Infinity ? null : z;
  };
}
/**
 * The outside of a set of meshes seen from a vertical axis: for a direction (the angle from +z toward +x) and a
 * height, the furthest any of their triangles reaches from the axis (world space, rest pose). Triangles with a corner
 * that `keep` rejects are left out (the arms). Smoothed a little, so what is fitted to it does not ripple.
 */
function aroundOf(meshes: THREE.Mesh[], ax: number, az: number, keep: (v: THREE.Vector3) => boolean = () => true, cell = 0.03, bins = 72): (angle: number, y: number) => number | null {
  const samples: number[] = []; let y0 = Infinity, y1 = -Infinity; const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), q = new THREE.Vector3();
  for (const m of meshes) {
    const pos = m.geometry.attributes.position, idx = m.geometry.index; const n = idx ? idx.count : pos.count; const at = (i: number, v: THREE.Vector3) => v.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(m.matrixWorld);
    for (let i = 0; i < n; i += 3) {
      at(i, a); at(i + 1, b); at(i + 2, c); if (!keep(a) || !keep(b) || !keep(c)) continue;
      const steps = Math.max(1, Math.ceil(Math.max(a.distanceTo(b), b.distanceTo(c), c.distanceTo(a)) / (cell * 0.7))); // fine enough to leave no cell out
      for (let u = 0; u <= steps; u++) for (let w = 0; w <= steps - u; w++) {
        q.copy(a).multiplyScalar(u / steps).addScaledVector(b, w / steps).addScaledVector(c, (steps - u - w) / steps);
        samples.push(Math.atan2(q.x - ax, q.z - az), q.y, Math.hypot(q.x - ax, q.z - az)); if (q.y < y0) y0 = q.y; if (q.y > y1) y1 = q.y;
      }
    }
  }
  if (!samples.length) return () => null;
  const rows = Math.ceil((y1 - y0) / cell) + 1; let grid = new Float32Array(rows * bins).fill(-1);
  const colOf = (angle: number) => (((Math.round(((angle + Math.PI) / (2 * Math.PI)) * bins) % bins) + bins) % bins);
  for (let i = 0; i < samples.length; i += 3) { const k = Math.round((samples[i + 1] - y0) / cell) * bins + colOf(samples[i]); if (samples[i + 2] > grid[k]) grid[k] = samples[i + 2]; }
  // directions nothing lies in (between the legs) take their neighbours' reach, then a light blur along and across
  for (let r = 0; r < rows; r++) for (let pass = 0; pass < bins; pass++) { let more = false; for (let col = 0; col < bins; col++) { const k = r * bins + col; if (grid[k] >= 0) continue; const v = Math.max(grid[r * bins + ((col + bins - 1) % bins)], grid[r * bins + ((col + 1) % bins)]); if (v >= 0) grid[k] = v; else more = true; } if (!more) break; }
  for (let pass = 0; pass < 2; pass++) {
    const next = grid.slice();
    for (let r = 0; r < rows; r++) for (let col = 0; col < bins; col++) { let sum = 0, n = 0; for (const [dr, dc] of [[0, 0], [0, 0], [0, 1], [0, -1], [1, 0], [-1, 0]]) { const rr = r + dr; if (rr < 0 || rr >= rows) continue; const v = grid[rr * bins + ((col + dc + bins) % bins)]; if (v >= 0) { sum += v; n++; } } if (n) next[r * bins + col] = sum / n; }
    grid = next;
  }
  return (angle, y) => {
    const fy = Math.min(rows - 1, Math.max(0, (y - y0) / cell)), r0 = Math.floor(fy), r1 = Math.min(rows - 1, r0 + 1), ty = fy - r0;
    const fx = ((angle + Math.PI) / (2 * Math.PI)) * bins, c0 = ((Math.floor(fx) % bins) + bins) % bins, c1 = (c0 + 1) % bins, tx = fx - Math.floor(fx);
    const v = [grid[r0 * bins + c0], grid[r0 * bins + c1], grid[r1 * bins + c0], grid[r1 * bins + c1]]; if (v.some((x) => x < 0)) { const ok = v.filter((x) => x >= 0); return ok.length ? Math.max(...ok) : null; }
    return (v[0] * (1 - tx) + v[1] * tx) * (1 - ty) + (v[2] * (1 - tx) + v[3] * tx) * ty;
  };
}
/**
 * Costume parts that lie on the front of the torso, each laid on this body's front. lift: how far off the body (ft);
 * depth: the part has a thickness of its own, which is kept; below: only what hangs below this height on the old
 * torso is laid down (the rest goes round the neck and keeps the plain fit).
 */
const DRAPED: Record<string, { lift: number; depth?: boolean; below?: number }> = {
  cos_emblem_star: { lift: 0.014 }, cos_emblem_bolt: { lift: 0.014 }, cos_emblem_ring: { lift: 0.014 },
  cos_shirtfront: { lift: 0.012 }, cos_tie: { lift: 0.026 },
  cos_scarf: { lift: 0.02, depth: true, below: 1.42 }, cos_pack: { lift: 0.012, depth: true },
};
/** Costume parts that go round the torso, refitted to this body's outline at every height; `below`: as above. */
const WRAPPED: Record<string, { below?: number }> = { cos_belt: {}, cos_robe: {}, cos_chest: { below: 1.47 } };
/** The badge: about two business cards (3.4 x 4.3 in), hanging from a lanyard a hand's length below the collar. Feet. */
const BADGE = { w: 0.28, h: 0.36, t: 0.012, drop: 0.8, cord: 0.014 };

/** The same surface with no edge longer than `maxEdge`: long triangles are bisected, so the piece can follow a curved body. Positions only. */
function refined(g: THREE.BufferGeometry, maxEdge: number): THREE.BufferGeometry {
  const src = g.index ? g.toNonIndexed() : g; const a = src.attributes.position.array as ArrayLike<number>; const out: number[] = [];
  const split = (p: number[], q: number[], r: number[], depth: number) => {
    const d = (u: number[], v: number[]) => Math.hypot(u[0] - v[0], u[1] - v[1], u[2] - v[2]); const pq = d(p, q), qr = d(q, r), rp = d(r, p); const longest = Math.max(pq, qr, rp);
    if (longest <= maxEdge || depth > 12) { out.push(...p, ...q, ...r); return; }
    const mid = (u: number[], v: number[]) => [(u[0] + v[0]) / 2, (u[1] + v[1]) / 2, (u[2] + v[2]) / 2];
    if (longest === pq) { const m = mid(p, q); split(p, m, r, depth + 1); split(m, q, r, depth + 1); }
    else if (longest === qr) { const m = mid(q, r); split(p, q, m, depth + 1); split(p, m, r, depth + 1); }
    else { const m = mid(r, p); split(p, q, m, depth + 1); split(m, q, r, depth + 1); }
  };
  for (let i = 0; i < a.length; i += 9) split([a[i], a[i + 1], a[i + 2]], [a[i + 3], a[i + 4], a[i + 5]], [a[i + 6], a[i + 7], a[i + 8]], 0);
  const res = new THREE.BufferGeometry(); res.setAttribute("position", new THREE.Float32BufferAttribute(out, 3));
  return mergeVertices(res, 1e-5);
}

/** The open edges of a mesh as closed loops of world-space points, in order (vertices are welded by position first: UV seams are not edges). */
function openLoops(m: THREE.Mesh): THREE.Vector3[][] {
  const pos = m.geometry.attributes.position, idx = m.geometry.index; const ids: number[] = [], pts: THREE.Vector3[] = [], byKey = new Map<string, number>(); const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld); const k = `${Math.round(v.x * 1e4)},${Math.round(v.y * 1e4)},${Math.round(v.z * 1e4)}`;
    let id = byKey.get(k); if (id == null) { id = pts.length; byKey.set(k, id); pts.push(v.clone()); } ids.push(id);
  }
  const uses = new Map<string, number>(); const edge = (a: number, b: number) => { const k = a < b ? `${a},${b}` : `${b},${a}`; uses.set(k, (uses.get(k) ?? 0) + 1); };
  const n = idx ? idx.count : pos.count; const at = (i: number) => ids[idx ? idx.getX(i) : i];
  for (let i = 0; i < n; i += 3) { const a = at(i), b = at(i + 1), c = at(i + 2); edge(a, b); edge(b, c); edge(c, a); }
  const next = new Map<number, number[]>(); const link = (a: number, b: number) => { const l = next.get(a); if (l) l.push(b); else next.set(a, [b]); };
  for (const [k, c] of uses) { if (c !== 1) continue; const [a, b] = k.split(",").map(Number); link(a, b); link(b, a); }
  const seen = new Set<number>(); const loops: THREE.Vector3[][] = [];
  for (const start of next.keys()) {
    if (seen.has(start)) continue; const loop: THREE.Vector3[] = []; let cur: number | undefined = start, prev = -1;
    while (cur != null && !seen.has(cur)) { seen.add(cur); loop.push(pts[cur]); const from: number = cur; cur = next.get(from)!.find((x) => x !== prev && !seen.has(x)); prev = from; }
    loops.push(loop);
  }
  return loops;
}

export interface Assembled { scene: THREE.Group; clips: THREE.AnimationClip[] }

export async function assembleAvatar(body: BodyType, url: string): Promise<Assembled> {
  const gltf = await new GLTFLoader().loadAsync(url);
  const scene = gltf.scene as THREE.Group; scene.name = `avatar-${body}`;
  scene.updateMatrixWorld(true);
  const bone = (n: string) => { const b = scene.getObjectByName(n); if (!b) throw new Error(`assemble: no bone ${n}`); return b; };
  // MakeHuman's game rig (Unreal-style joint names)
  const head = bone("Head"), torso = bone("spine_03"), fist = bone("hand_l"); // the +x hand, where the procedural figure's "hand_r" was
  const armX = new THREE.Vector3().setFromMatrixPosition(bone("upperarm_l").matrixWorld).x; // the sleeves start here
  const old = buildAvatar(body);
  old.updateMatrixWorld(true);

  // head parts: the procedural head sphere → the new head. The old head is a ball with its eyes a third of the way up
  // from its middle; a real head has them at mid-height. So each part's vertices are moved one by one: heights above
  // the old eye line are scaled so the old crown lands on the new crown, heights below it so the old chin lands on
  // the new jaw, and the eye line stays on the eyes (a mask covers them, a visor slot and a cowl's lenses sit over
  // them). Sideways and in depth there are two fits: coverings (cowl, helmet, hood, hat, antenna) get a shell a fifth
  // outside the skin, so nothing pokes through; face pieces (mask, shades, earpiece) sit just off the face.
  const headPos = new THREE.Vector3().setFromMatrixPosition(head.matrixWorld);
  // the head's skin: above the neck and no wider than a head, so the shoulders and hands stay out of the measurement
  const neckY = new THREE.Vector3().setFromMatrixPosition(bone("neck_01").matrixWorld).y;
  const hb = measure(scene, "skin", (v) => v.y > neckY + 0.12 && Math.abs(v.x) < 0.6);
  const hc = hb.getCenter(new THREE.Vector3()), hr = hb.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  const eyes = measure(scene, "eye", () => true); const eyeY = eyes.getCenter(new THREE.Vector3()).y;
  const OLD_EYE = OLD_HEAD_C.y + 0.28, OLD_TOP = OLD_HEAD_C.y + OLD_HEAD_R.y, OLD_BOTTOM = OLD_HEAD_C.y - OLD_HEAD_R.y;
  const up = (hb.max.y + 0.02 - eyeY) / (OLD_TOP - OLD_EYE), down = (eyeY - hb.min.y) / (OLD_EYE - OLD_BOTTOM);
  const headHold = holder(head, "head_parts");
  const refit = (part: THREE.Mesh, sx: number, sz: number, cz: number, lift = 0) => {
    part.updateMatrix(); const g = part.geometry.clone(); const pos = g.attributes.position as THREE.BufferAttribute; const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(part.matrix); // in the old head's own space
      pos.setXYZ(i, hc.x + v.x * sx - headPos.x, eyeY + lift + (v.y - OLD_EYE) * (v.y >= OLD_EYE ? up : down) - headPos.y, cz + v.z * sz - headPos.z);
    }
    g.computeVertexNormals(); part.geometry = g; part.position.set(0, 0, 0); part.quaternion.identity(); part.scale.set(1, 1, 1); headHold.add(part);
  };
  // a covering: a fifth outside the skin all round. A face piece: its front (the old face, 0.66 out) a finger off the eyes
  const cover = { sx: (hr.x * 1.22) / OLD_HEAD_R.x, sz: (hr.z * 1.25) / OLD_HEAD_R.z, cz: hc.z };
  const faceZ = hc.z - hr.z * 0.15; // the middle of the skull, behind the box centre (which the nose pulls forward)
  const face = { sx: (hr.x * 1.05) / OLD_HEAD_R.x, sz: (eyes.max.z + 0.035 - faceZ) / 0.66, cz: faceZ };
  const oldHead = old.getObjectByName("head")!;
  for (const c of [...oldHead.children]) {
    if (!(c as THREE.Mesh).isMesh || !c.name.startsWith("cos_")) continue;
    const f = ["cos_mask", "cos_shades", "cos_earpiece"].includes(c.name) ? face : cover;
    // a hat's brim sat just over the old head's eyes; on a real head it belongs at the hairline, halfway up to the crown
    refit(c as THREE.Mesh, f.sx, f.sz, f.cz, c.name === "cos_hat" ? (hb.max.y - eyeY) * 0.45 : 0);
  }

  // chest parts: the procedural torso (its own shirt mesh, torso_m) → the new shirt's core (sleeves left out)
  const oldTorso = old.getObjectByName("torso")!, oldShirt = old.getObjectByName("torso_m") as THREE.Mesh;
  oldShirt.geometry.computeBoundingBox(); const ob = oldShirt.geometry.boundingBox!;
  const oc = ob.getCenter(new THREE.Vector3()), or = ob.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  const tb = measure(scene, "shirt", (v) => Math.abs(v.x) < armX); // the sleeves start where the upper arm bones do
  const tc = tb.getCenter(new THREE.Vector3()), tr = tb.getSize(new THREE.Vector3()).multiplyScalar(0.5).add(new THREE.Vector3(0.08, 0, 0.1)); // a little proud of the shirt
  const torsoHold = holder(torso, "torso_parts");
  const torsoFit = new THREE.Group(); torsoFit.name = "torso_fit";
  torsoFit.position.copy(tc).sub(new THREE.Vector3().setFromMatrixPosition(torso.matrixWorld));
  torsoFit.scale.set(tr.x / or.x, tr.y / or.y, tr.z / or.z);
  const torsoShift = new THREE.Group(); torsoShift.position.copy(oc).negate();
  torsoHold.add(torsoFit); torsoFit.add(torsoShift);
  // The fit above is one stretch of the old barrel-shaped torso onto the new one: right for what sits round the
  // shoulders, but a real body is not a barrel, so two kinds of part are placed against the body itself. What lies on
  // the chest (emblems, tie, shirt front, scarf ends, pack straps) is laid on the body's front; what goes round the
  // torso (belt, robe, chest plate) is refitted to the body's outline at each height, keeping how far it stood off
  // the old torso. Both are cut fine enough to bend first.
  const oldAt = new THREE.Vector3().setFromMatrixPosition(oldTorso.matrixWorld);
  const oldAround = aroundOf([oldShirt], oldAt.x, oldAt.z);
  const fine = new Map<THREE.Mesh, Float32Array>(); const p = new THREE.Vector3(); // each part's vertices as they were on the old torso (its own space)
  for (const c of oldTorso.children) {
    const m = c as THREE.Mesh; if (!m.isMesh || !(DRAPED[m.name] || WRAPPED[m.name])) continue;
    m.updateMatrixWorld(true); m.geometry = refined(m.geometry, 0.14);
    const pos = m.geometry.attributes.position; const was = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) { p.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).sub(oldAt); was.set([p.x, p.y, p.z], i * 3); }
    fine.set(m, was);
  }
  lift(oldTorso, torsoShift);
  scene.updateMatrixWorld(true);
  const bodyMeshes = (names: string[]) => { const out: THREE.Mesh[] = []; scene.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && names.includes((m.material as THREE.Material).name)) out.push(m); }); return out; };
  const bodyFront = frontOf(bodyMeshes(["shirt", "skin"]));
  const bodyAround = aroundOf(bodyMeshes(["shirt", "skin", "pants"]), tc.x, tc.z, (v) => Math.abs(v.x) <= armX + 0.02); // the arms left out
  const hipY = new THREE.Vector3().setFromMatrixPosition(bone("pelvis").matrixWorld).y, spread = (torsoFit.scale.x + torsoFit.scale.z) / 2;
  for (const [m, was] of fine) {
    const pos = m.geometry.attributes.position as THREE.BufferAttribute; const draped = DRAPED[m.name], wrapped = WRAPPED[m.name];
    if (draped) {
      const on = (i: number) => was[i * 3 + 2] > 0.1 && (draped.below == null || was[i * 3 + 1] < draped.below); // in front of the old torso
      let back = Infinity; for (let i = 0; i < pos.count; i++) if (on(i)) back = Math.min(back, was[i * 3 + 2]);
      for (let i = 0; i < pos.count; i++) {
        if (!on(i)) continue;
        p.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld); const f = bodyFront(p.x, p.y); if (f == null) continue;
        p.z = f + draped.lift + (draped.depth ? (was[i * 3 + 2] - back) * torsoFit.scale.z : 0); m.worldToLocal(p); pos.setXYZ(i, p.x, p.y, p.z);
      }
    } else {
      for (let i = 0; i < pos.count; i++) {
        const x = was[i * 3], y = was[i * 3 + 1], z = was[i * 3 + 2]; if (wrapped.below != null && y >= wrapped.below) continue;
        const angle = Math.atan2(x, z); const from = oldAround(angle, oldAt.y + y); // the old torso's reach that way (its lowest row for what hangs below it)
        p.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld); const to = bodyAround(angle, Math.max(p.y, hipY - 0.15)); // below the hips a robe falls from them
        if (from == null || to == null) continue;
        const r = to + 0.012 + (Math.hypot(x, z) - from) * spread;
        p.set(tc.x + r * Math.sin(angle), p.y, tc.z + r * Math.cos(angle)); m.worldToLocal(p); pos.setXYZ(i, p.x, p.y, p.z);
      }
    }
    m.geometry.computeVertexNormals();
  }

  // The badge and its lanyard are made for this body, not refitted: the cord lies on the shirt's collar round the back
  // of the neck, leaves it at the sides and runs down the chest to the clip, taut (it follows the chest where the
  // chest is in the way and spans straight where it is not); the badge hangs flat and upright from the clip, clear of
  // whatever part of the chest sticks out furthest behind and above it.
  const badge = scene.getObjectByName("badge") as THREE.Mesh | undefined, cord = scene.getObjectByName("lanyard_m") as THREE.Mesh | undefined;
  const collar = bodyMeshes(["shirt"]).flatMap(openLoops).filter((l) => l.length > 8 && Math.abs(l.reduce((t, q) => t + q.x, 0) / l.length) < 0.2).sort((u, w) => w.reduce((t, q) => t + q.y, 0) / w.length - u.reduce((t, q) => t + q.y, 0) / u.length)[0];
  if (badge && cord && collar) {
    const k = scene.getObjectByName("Head_end")!.getWorldPosition(new THREE.Vector3()).y / 6; // the lanyard's lengths were set on a 6 ft figure
    const c = collar.reduce((t, q) => t.add(q), new THREE.Vector3()).multiplyScalar(1 / collar.length);
    const front = collar.reduce((u, w) => (w.z > u.z ? w : u)); // the collar's front centre
    const clipY = front.y - BADGE.drop * k, top = clipY - 0.02, bottom = top - BADGE.h;
    // the plane the badge hangs in: just clear of the chest anywhere behind it or above it up to the collar
    let plane = -Infinity; for (let y = bottom; y <= front.y - 0.1; y += 0.02) for (let x = c.x - BADGE.w / 2; x <= c.x + BADGE.w / 2 + 1e-6; x += 0.02) { const f = bodyFront(x, y); if (f != null && f > plane) plane = f; }
    plane += 0.02;
    const place = (m: THREE.Mesh, g: THREE.BufferGeometry) => { torsoHold.add(m); m.position.set(0, 0, 0); m.quaternion.identity(); m.scale.set(1, 1, 1); m.updateMatrixWorld(true); m.geometry = g.applyMatrix4(m.matrixWorld.clone().invert()); };
    place(badge, new THREE.BoxGeometry(BADGE.w, BADGE.h, BADGE.t).translate(c.x, top - BADGE.h / 2, plane + BADGE.t / 2));
    // the cord: the collar's back from one side of the neck to the other, then down each side of the chest to the clip
    const angle = (q: THREE.Vector3) => Math.atan2(q.x - c.x, q.z - c.z); // 0 at the front, ±π at the back
    const back = collar.filter((q) => Math.abs(angle(q)) > 1.25).sort((u, w) => ((angle(u) + 2 * Math.PI) % (2 * Math.PI)) - ((angle(w) + 2 * Math.PI) % (2 * Math.PI))); // from the +x side round the back to the -x side
    const out = (q: THREE.Vector3) => { const o = new THREE.Vector3(q.x - c.x, 0, q.z - c.z).normalize(); return q.clone().addScaledVector(o, BADGE.cord * 0.6).setY(q.y + BADGE.cord * 0.6); };
    const clip = new THREE.Vector3(c.x, clipY, plane + BADGE.cord);
    const strap = (from: THREE.Vector3, steps = 9) => { // points from the neck's side down to the clip, the first and last left out
      const pts: THREE.Vector3[] = [];
      for (let i = 1; i < steps; i++) { const t = i / steps; const q = from.clone().lerp(clip, t); const f = bodyFront(q.x, q.y); if (f != null) q.z = Math.max(q.z, f + BADGE.cord + 0.004); pts.push(q); }
      return pts;
    };
    const ring = back.map(out); const first = ring[0], last = ring[ring.length - 1];
    const path = [clip, ...strap(first).reverse(), ...ring, ...strap(last)];
    const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path, true, "centripetal"), 84, BADGE.cord, 5, true);
    const clasp = new THREE.BoxGeometry(0.075, 0.05, 0.02).translate(c.x, clipY - 0.012, plane + 0.012);
    place(cord, mergeGeometries([tube, clasp], false)!);
  }

  // carried props: built for a hand hanging down (-y along the arm, palm toward the body at -x). The holder turns that
  // frame onto the hand as it rests on this rig, whichever way its arm is modelled: -y along the fingers, -x out of the
  // palm. The grip sits in the palm, a little down the hand from the wrist joint.
  const at = (n: string) => { const b = scene.getObjectByName(n); return b ? new THREE.Vector3().setFromMatrixPosition(b.matrixWorld) : null; };
  const wrist = at("hand_l")!, knuckle = at("middle_01_l"), index = at("index_01_l"), pinky = at("pinky_01_l");
  let grip = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2); // an arm resting along +x, palm down
  if (knuckle && index && pinky) {
    const d = knuckle.clone().sub(wrist).normalize(); const palm = pinky.clone().sub(index).cross(d).normalize(); // out of the palm of the +x hand
    const y = d.clone().negate(), x = palm.clone().negate().addScaledVector(y, palm.dot(y)).normalize(); // -(palm), squared up to the fingers
    grip = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, x.clone().cross(y)));
  }
  const handHold = holder(fist, "hand_parts", grip);
  if (knuckle) handHold.position.copy(fist.worldToLocal(wrist.clone().lerp(knuckle, 0.75)));
  lift(old.getObjectByName("hand_r")!, handHold);

  scene.add(bakeLod(scene, gltf.animations));
  return { scene, clips: gltf.animations };
}

/**
 * The far-crowd stand-in: the body and the short hair skinned into the idle pose and merged into one static mesh. Each
 * vertex carries _part (see LOD_PARTS) so one instanced draw can colour skin, shirt, pants and hair per figure.
 */
function bakeLod(scene: THREE.Object3D, clips: THREE.AnimationClip[]): THREE.Mesh {
  const idle = clips.find((c) => c.name === "idle");
  const bones: THREE.Object3D[] = []; scene.traverse((o) => { if ((o as THREE.Bone).isBone) bones.push(o); });
  const saved = bones.map((b) => ({ p: b.position.clone(), q: b.quaternion.clone(), s: b.scale.clone() }));
  const mixer = new THREE.AnimationMixer(scene);
  if (idle) { mixer.clipAction(idle).play(); mixer.update(0.2); }
  scene.updateMatrixWorld(true);
  const geos: THREE.BufferGeometry[] = []; const v = new THREE.Vector3();
  scene.traverse((o) => {
    const m = o as THREE.SkinnedMesh; if (!m.isSkinnedMesh) return;
    // a one-primitive hair mesh carries its node name; the loader splits a multi-primitive node into children of a group with that name
    const node = m.name.startsWith("hair_") || !m.parent?.name.startsWith("hair_") ? m.name : m.parent.name;
    const partName = (m.material as THREE.Material).name;
    if (node.startsWith("hair_") && node !== "hair_short") return;
    const part = LOD_PART_OF[partName]; if (part == null) return;
    const src = m.geometry; const pos = src.attributes.position; const out = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) { m.applyBoneTransform(i, v.fromBufferAttribute(pos, i)); out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z; }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(out, 3));
    g.setAttribute("_part", new THREE.BufferAttribute(new Float32Array(pos.count).fill(part / 8), 1));
    if (src.index) g.setIndex(src.index.clone());
    geos.push(g);
  });
  mixer.stopAllAction();
  bones.forEach((b, i) => { b.position.copy(saved[i].p); b.quaternion.copy(saved[i].q); b.scale.copy(saved[i].s); });
  scene.updateMatrixWorld(true);
  const merged = mergeGeometries(geos, false); if (!merged) throw new Error("assemble: lod merge failed");
  merged.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.8 }); mat.name = "lod";
  const mesh = new THREE.Mesh(merged, mat); mesh.name = "lod";
  return mesh;
}
