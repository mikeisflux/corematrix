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
import { buildAvatar, CARRY, OLD_EYE, AVATAR_HAT, AVATAR_SHADES, AVATAR_EARBUD, type BodyType } from "./avatar";
import { GRIPS, GRIP_OF, handGrip } from "./grip";

// the procedural head (avatar.ts): a sphere of these radii centred HC above the head node
const OLD_HEAD_C = new THREE.Vector3(0, 0.62, 0), OLD_HEAD_R = new THREE.Vector3(0.7, 0.7 * 1.08, 0.7 * 0.96);

/**
 * Head-worn coverings: the height on the old head (above its centre) that lands on this head's eye line. The old figure
 * wore its visor and cowl band above its low-set eyes; here they go across the eyes. The hood's rim keeps its place
 * relative to the eyes.
 */
const EYE_REF: Record<string, number> = { cos_cowl: 0.27, cos_helmet: 0.27, cos_helmet_visor: 0.27, cos_hood: 0.2 };
/**
 * Head-worn coverings follow this head's own outline rather than a ball's: `clear` is how far off the skin they sit
 * (ft) on top of what they stood off the old head; `round`: a rigid shell, which smooths over the ears and brow;
 * `skirt`: below the jaw it hangs down instead of closing in on the neck, this wide against the jaw line.
 */
const SHELL: Record<string, { clear: number; round?: boolean; skirt?: number }> = {
  cos_cowl: { clear: 0.008 }, cos_antenna: { clear: 0.03 },
  cos_helmet: { clear: 0.03, round: true, skirt: 0.9 }, cos_helmet_visor: { clear: 0.03, round: true, skirt: 0.9 }, cos_hood: { clear: 0.03, round: true, skirt: 0.85 },
};
/** The pointed hat's band sits this share of the way from the eye line to the crown, and the hat is this many feet per unit of the old figure. */
const HAT_FIT = { lift: 0.42, scale: 0.45 };

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
 * over it (world space, rest pose), or null where there is none. With `dir` -1 it is their back: the smallest z.
 */
function frontOf(meshes: THREE.Mesh[], cell = 0.02, dir: 1 | -1 = 1): (x: number, y: number) => number | null {
  const tris: number[] = []; const box = new THREE.Box3(); const v = new THREE.Vector3();
  for (const m of meshes) {
    const pos = m.geometry.attributes.position, idx = m.geometry.index; const n = idx ? idx.count : pos.count;
    for (let i = 0; i < n; i++) { v.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(m.matrixWorld); v.z *= dir; box.expandByPoint(v); tris.push(v.x, v.y, v.z); }
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
    const z = grid[j * nx + i]; return z === -Infinity ? null : z * dir;
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
 * The outside of a set of meshes seen from a point inside them: for a direction, the furthest any of their triangles
 * reaches from `c` (world space, rest pose). Each pass of `smooth` takes the neighbours' largest reach and then
 * averages, so the result is rounder and stays outside the surface; 0 keeps the surface as it is.
 */
function shellOf(meshes: THREE.Mesh[], c: THREE.Vector3, keep: (v: THREE.Vector3) => boolean, smooth = 1, cols = 72, rows = 36): (x: number, y: number, z: number) => number {
  let grid = new Float32Array(rows * cols).fill(-1); const a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3(), q = new THREE.Vector3();
  const rowOf = (lat: number) => Math.min(rows - 1, Math.max(0, (lat / Math.PI + 0.5) * (rows - 1))), colOf = (lon: number) => ((lon + Math.PI) / (2 * Math.PI)) * cols;
  for (const m of meshes) {
    const pos = m.geometry.attributes.position, idx = m.geometry.index; const n = idx ? idx.count : pos.count; const at = (i: number, v: THREE.Vector3) => v.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(m.matrixWorld);
    for (let i = 0; i < n; i += 3) {
      at(i, a); at(i + 1, b); at(i + 2, d); if (!keep(a) || !keep(b) || !keep(d)) continue;
      const steps = Math.max(1, Math.ceil(Math.max(a.distanceTo(b), b.distanceTo(d), d.distanceTo(a)) / (1.2 / cols))); // fine enough to leave no cell out
      for (let u = 0; u <= steps; u++) for (let w = 0; w <= steps - u; w++) {
        q.copy(a).multiplyScalar(u / steps).addScaledVector(b, w / steps).addScaledVector(d, (steps - u - w) / steps).sub(c); const r = q.length(); if (r < 1e-6) continue;
        const k = Math.round(rowOf(Math.asin(q.y / r))) * cols + (Math.round(colOf(Math.atan2(q.x, q.z))) % cols); if (r > grid[k]) grid[k] = r;
      }
    }
  }
  const near = (r: number, col: number, f: (v: number) => void) => { for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) { const rr = r + dr; if (rr >= 0 && rr < rows) { const v = grid[rr * cols + ((col + dc + cols) % cols)]; if (v >= 0) f(v); } } };
  // directions nothing lies in (down the neck) take their neighbours' reach
  for (let pass = 0; pass < rows; pass++) { const next = grid.slice(); let more = false; for (let r = 0; r < rows; r++) for (let col = 0; col < cols; col++) { if (grid[r * cols + col] >= 0) continue; let sum = 0, n = 0; near(r, col, (v) => { sum += v; n++; }); if (n) next[r * cols + col] = sum / n; else more = true; } grid = next; if (!more) break; }
  for (let pass = 0; pass < smooth; pass++) {
    const high = grid.slice(); for (let r = 0; r < rows; r++) for (let col = 0; col < cols; col++) near(r, col, (v) => { if (v > high[r * cols + col]) high[r * cols + col] = v; });
    grid = high; const next = grid.slice(); for (let r = 0; r < rows; r++) for (let col = 0; col < cols; col++) { let sum = 0, n = 0; near(r, col, (v) => { sum += v; n++; }); next[r * cols + col] = sum / n; }
    grid = next;
  }
  return (x, y, z) => {
    const fy = rowOf(Math.asin(y / Math.hypot(x, y, z))), r0 = Math.floor(fy), r1 = Math.min(rows - 1, r0 + 1), ty = fy - r0;
    const fx = colOf(Math.atan2(x, z)), c0 = ((Math.floor(fx) % cols) + cols) % cols, c1 = (c0 + 1) % cols, tx = fx - Math.floor(fx);
    return (grid[r0 * cols + c0] * (1 - tx) + grid[r0 * cols + c1] * tx) * (1 - ty) + (grid[r1 * cols + c0] * (1 - tx) + grid[r1 * cols + c1] * tx) * ty;
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
};
/**
 * Costume parts that go round the torso, refitted to this body's outline at every height; `below`: as above; `flare`:
 * how much of its stand-off from the old torso the part keeps (the robe follows the legs now, so it need not be a bell);
 * `clear`: how far off the body it sits (ft); `tuck`: the old height above which the part closes in on the body (a
 * robe's waist goes under the belt).
 */
const WRAPPED: Record<string, { below?: number; flare?: number; clear?: number; tuck?: number }> = { cos_belt: {}, cos_robe: { flare: 0.3, clear: 0.03, tuck: -0.12 }, cos_chest: {} };
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

  // head parts: the procedural head sphere → the new head. The old head is a ball with its eyes a fifth of the way up
  // from its middle; a real head has its eyes at mid-height, a nose, ears and a skull that is deeper than it is wide.
  // So each part's vertices are moved one by one, in one of three ways. Coverings (cowl, helmet, hood, antenna band)
  // first get the old ball's proportions: the height named for the part in EYE_REF lands on the eye line, heights
  // above it are scaled so the old crown lands on the new crown, heights below it so the old chin lands on the new
  // chin, and what hangs below the chin (a hood's mantle) keeps the body's scale; then each vertex is moved along its
  // direction from the middle of the head onto this head's own outline (SHELL), as far off it as it stood off the
  // ball. The hat is fitted round the head and every hair style at its band. What is worn on the face (mask, cowl
  // lenses, glasses, earpiece) is drawn round the old eyes and is seated on the real eyes, face and ear.
  const headPos = new THREE.Vector3().setFromMatrixPosition(head.matrixWorld);
  // the head's skin: above the neck and no wider than a head, so the shoulders and hands stay out of the measurement
  const neckY = new THREE.Vector3().setFromMatrixPosition(bone("neck_01").matrixWorld).y;
  const hb = measure(scene, "skin", (v) => v.y > neckY + 0.12 && Math.abs(v.x) < 0.6);
  const hc = hb.getCenter(new THREE.Vector3()), hr = hb.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  const eyes = measure(scene, "eye", () => true); const eyeY = eyes.getCenter(new THREE.Vector3()).y;
  const chinY = measure(scene, "skin", (v) => v.y > neckY && Math.abs(v.x) < 0.12 && v.z > hc.z + hr.z * 0.5).min.y; // the front of the face reaches down to the chin
  const tall = scene.getObjectByName("Head_end")!.getWorldPosition(new THREE.Vector3()).y / 6; // against a 6 ft figure
  const OLD_TOP = OLD_HEAD_C.y + OLD_HEAD_R.y, OLD_BOTTOM = OLD_HEAD_C.y - OLD_HEAD_R.y;
  const headHold = holder(head, "head_parts");
  const skinMeshes: THREE.Mesh[] = [], shirtMeshes: THREE.Mesh[] = [], hairMeshes: THREE.Mesh[] = [];
  scene.traverse((o) => { const m = o as THREE.Mesh; if (!m.isMesh) return; if ((m.material as THREE.Material).name === "skin") skinMeshes.push(m); else if ((m.material as THREE.Material).name === "shirt") shirtMeshes.push(m); else if (m.name.startsWith("hair_") || m.parent?.name.startsWith("hair_")) hairMeshes.push(m); });
  const mid = new THREE.Vector3(hc.x, eyeY, hc.z - hr.z * 0.15); // the middle of the skull at eye height, behind the box centre (which the nose pulls forward)
  const onHead = (v: THREE.Vector3) => v.y > chinY - 0.06 && Math.hypot(v.x - mid.x, v.z - mid.z) < 0.45;
  const tight = shellOf(skinMeshes, mid, onHead, 0, 120, 60), snug = shellOf(skinMeshes, mid, onHead, 1), round = shellOf(skinMeshes, mid, onHead, 3);
  const skull = 0.3 * tall; // a head's radius, for turning a stand-off on the old ball (in its radii) into feet
  const cover = { sx: (hr.x * 1.22) / OLD_HEAD_R.x, sz: (hr.z * 1.25) / OLD_HEAD_R.z };
  // the body below the head as an outline round the neck's axis, down past the shoulders and out to the top of the arms
  const neckAt = new THREE.Vector3().setFromMatrixPosition(bone("neck_01").matrixWorld);
  const shoulders = aroundOf([...skinMeshes, ...shirtMeshes], neckAt.x, neckAt.z, (p) => p.y < chinY + 0.05 && p.y > chinY - 1 && Math.abs(p.x - neckAt.x) < armX + 0.3);
  const out = new THREE.Vector3(), dir = new THREE.Vector3();
  /** A covering's vertex (in the old head's space) on this head, world space. */
  const coverAt = (name: string, v: THREE.Vector3): THREE.Vector3 => {
    const ref = OLD_HEAD_C.y + (EYE_REF[name] ?? 0.28), up = (hb.max.y + 0.02 - eyeY) / (OLD_TOP - ref), down = (eyeY - chinY) / (ref - OLD_BOTTOM);
    const y = v.y >= ref ? eyeY + (v.y - ref) * up : v.y >= OLD_BOTTOM ? eyeY + (v.y - ref) * down : chinY - (OLD_BOTTOM - v.y) * 0.9 * tall;
    out.set(hc.x + v.x * cover.sx, y, hc.z + v.z * cover.sz);
    if (v.y < OLD_BOTTOM && name === "cos_hood") { // the mantle lies on the shoulders: the body's outline at that height, or its own cone where that is wider
      const angle = Math.atan2(v.x, v.z), top = y + 0.08, r = Math.max(Math.hypot(v.x, v.z) * 0.5 * tall, (shoulders(angle, top) ?? 0) + 0.035); // its top tucked up inside the hood, above the shirt's collar
      return out.set(neckAt.x + r * Math.sin(angle), top, neckAt.z + r * Math.cos(angle));
    }
    const fit = SHELL[name]; if (!fit || v.y < OLD_BOTTOM) return out;
    const shell = fit.round ? round : snug; dir.copy(out).sub(mid); const len = dir.length(); if (len < 1e-6) return out;
    const off = fit.clear + (Math.hypot((v.x - OLD_HEAD_C.x) / OLD_HEAD_R.x, (v.y - OLD_HEAD_C.y) / OLD_HEAD_R.y, (v.z - OLD_HEAD_C.z) / OLD_HEAD_R.z) - 1) * skull;
    const r = shell(dir.x, dir.y, dir.z) + off, el = Math.asin(dir.y / len), flat = Math.hypot(dir.x, dir.z);
    out.copy(mid).addScaledVector(dir, r / len);
    if (fit.skirt && el < -0.15 && flat > 1e-6) { // toward the neck: ease into a straight drop from the jaw line, at the height the old proportions gave
      const w = THREE.MathUtils.smoothstep(-el, 0.15, 0.6), jaw = 0.45, reach = (shell((dir.x / flat) * Math.cos(jaw), -Math.sin(jaw), (dir.z / flat) * Math.cos(jaw)) + off) * Math.cos(jaw);
      const now = Math.hypot(out.x - mid.x, out.z - mid.z), to = THREE.MathUtils.lerp(now, Math.max(now, reach * fit.skirt), w);
      out.set(mid.x + (dir.x / flat) * to, THREE.MathUtils.lerp(out.y, y, w), mid.z + (dir.z / flat) * to);
    }
    return out;
  };
  // the hat: its band goes round the head and every hair style at the hairline, the brim and the crown keep their
  // shape from there, and the crown is held clear of the hair all the way up
  const topOf = (v: THREE.Vector3) => v.y > eyeY && Math.hypot(v.x - mid.x, v.z - mid.z) < 0.6;
  const hairAround = aroundOf([...skinMeshes, ...hairMeshes], mid.x, mid.z, topOf); let hairTop = hb.max.y;
  for (const m of hairMeshes) { const pos = m.geometry.attributes.position; for (let i = 0; i < pos.count; i++) { out.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld); if (topOf(out) && out.y > hairTop) hairTop = out.y; } }
  const bandY = eyeY + (hb.max.y - eyeY) * HAT_FIT.lift;
  const hat = (v: THREE.Vector3): THREE.Vector3 => {
    const angle = Math.atan2(v.x, v.z), was = Math.hypot(v.x, v.z), dy = v.y - (OLD_HEAD_C.y + AVATAR_HAT.y), y = bandY + dy * HAT_FIT.scale * tall;
    const band = Math.max(hairAround(angle, bandY) ?? 0, hairAround(angle, bandY + 0.04) ?? 0) + 0.03;
    let r = band + (was - AVATAR_HAT.r) * HAT_FIT.scale * tall;
    if (dy > 0 && was < AVATAR_HAT.r - 1e-3) r = Math.max((band * was) / AVATAR_HAT.r, y < hairTop + 0.04 ? Math.max(hairAround(angle, y) ?? 0, hairAround(angle, y - 0.03) ?? 0) + 0.04 : 0);
    return out.set(mid.x + r * Math.sin(angle), y, mid.z + r * Math.cos(angle));
  };
  // the face: each eye from its lashes, the skin's front as a height field, the ear from what stands out past the skull
  const lash = [1, -1].map((side) => measure(scene, "lash", (v) => (v.x - hc.x) * side > 0).getCenter(new THREE.Vector3()));
  const eyeX = (lash[0].x - lash[1].x) / 2, lashY = (lash[0].y + lash[1].y) / 2, eyeScale = eyeX / OLD_EYE.x, oldEyeY = OLD_HEAD_C.y + OLD_EYE.y;
  const skinFront = frontOf(skinMeshes, 0.008);
  const faceZ = (x: number, y: number) => { let sum = 0, n = 0; for (const [dx, dy] of [[0, 0], [0.008, 0], [-0.008, 0], [0, 0.008], [0, -0.008]]) { const z = skinFront(x + dx, y + dy); if (z != null && z > mid.z) { sum += z; n++; } } return n ? sum / n : mid.z; };
  const ear = measure(scene, "skin", (v) => onHead(v) && v.x - hc.x > hr.x - 0.035); // the +x ear's rim
  /** A face piece's vertex: sideways and in height it keeps its place relative to the eyes, at the eyes' own spacing. */
  const byEyes = (v: THREE.Vector3, y0 = eyeY) => out.set(hc.x + v.x * eyeScale, y0 + (v.y - oldEyeY) * eyeScale, 0);
  const mask = (v: THREE.Vector3) => { byEyes(v, lashY); return out.setZ(faceZ(out.x, out.y) + 0.012); };
  // a cowl lens lies on the cowl: the point of the cowl's surface in front of where it is on the face
  const cowlOff = SHELL.cos_cowl.clear + (0.03 / 0.7) * skull + 0.008;
  const lens = (v: THREE.Vector3) => { byEyes(v); let z = eyes.max.z; for (let i = 0; i < 4; i++) { const r = snug(out.x - mid.x, out.y - mid.y, z - mid.z) + cowlOff; z = mid.z + Math.sqrt(Math.max(0, r * r - (out.x - mid.x) ** 2 - (out.y - mid.y) ** 2)); } return out.setZ(z); };
  // glasses: the front stands a finger off the eyes, clear of the brow and the bridge of the nose; each arm runs
  // straight from its hinge to the skull just above the ear, and its hook goes on down behind the ear
  const glassZ = Math.max(eyes.max.z + 0.022, faceZ(hc.x, eyeY + 0.07 * eyeScale) + 0.006, faceZ(hc.x + eyeX, eyeY + 0.055) + 0.004);
  const rest = new THREE.Vector3(0, ear.max.y + 0.005, ear.max.z - 0.02); rest.x = Math.sqrt(Math.max(0, (tight(hr.x, rest.y - mid.y, rest.z - mid.z) + 0.006) ** 2 - (rest.y - mid.y) ** 2 - (rest.z - mid.z) ** 2)); // off the middle, on the skull
  const shades = (v: THREE.Vector3) => {
    const side = Math.sign(v.x) || 1, t = (AVATAR_SHADES.z - 0.04 - v.z) / AVATAR_SHADES.len;
    if (t < 0.08) { byEyes(v); return out.setZ(glassZ + (v.z - AVATAR_SHADES.z) * eyeScale); }
    const hx = AVATAR_SHADES.x * eyeScale, hy = eyeY + AVATAR_SHADES.y * eyeScale, hz = glassZ - 0.04 * eyeScale; // the hinge
    return out.set(hc.x + side * (hx + (rest.x - hx) * t) + (v.x - side * AVATAR_SHADES.x) * eyeScale, hy + (rest.y - hy) * t + (v.y - oldEyeY - AVATAR_SHADES.y) * eyeScale, hz + (rest.z - hz) * t);
  };
  // earpiece: the bud in the hollow of the ear, the lead down the skin behind the jaw
  const budAt = new THREE.Vector3(ear.max.x - 0.03, (ear.min.y + ear.max.y) / 2 - 0.01, ear.max.z - 0.02);
  const earpiece = (v: THREE.Vector3) => {
    out.set(budAt.x + (v.x - AVATAR_EARBUD[0]) * eyeScale, budAt.y + (v.y - AVATAR_EARBUD[1]) * eyeScale, budAt.z + (v.z - AVATAR_EARBUD[2]) * eyeScale);
    const w = THREE.MathUtils.smoothstep(budAt.y - out.y, 0.01, 0.06); // below the bud the lead lies on the skin
    if (w > 0) { dir.copy(out).sub(mid); const len = dir.length(); out.copy(mid).addScaledVector(dir, THREE.MathUtils.lerp(len, tight(dir.x, dir.y, dir.z) + 0.008, w) / len); }
    return out;
  };
  const seat: Record<string, (v: THREE.Vector3) => THREE.Vector3> = { cos_hat: hat, cos_mask: mask, cos_cowl_eyes: lens, cos_shades: shades, cos_earpiece: earpiece };
  const oldHead = old.getObjectByName("head")!; const v = new THREE.Vector3();
  for (const c of [...oldHead.children]) {
    const part = c as THREE.Mesh; if (!part.isMesh || !part.name.startsWith("cos_")) continue;
    part.updateMatrix(); let g = part.geometry.clone(); const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(part.matrix); // in the old head's own space
      const to = seat[part.name] ? seat[part.name](v) : coverAt(part.name, v); pos.setXYZ(i, to.x - headPos.x, to.y - headPos.y, to.z - headPos.z);
    }
    if (SHELL[part.name] || part.name === "cos_hat") { g.deleteAttribute("normal"); g.deleteAttribute("uv"); g = mergeVertices(g, 1e-4); } // pieces that share an edge become one surface
    g.computeVertexNormals(); part.geometry = g; part.position.set(0, 0, 0); part.quaternion.identity(); part.scale.set(1, 1, 1); headHold.add(part);
  }
  // The hood is cloth on two parts of the body: the hood turns with the head, the mantle stays on the shoulders (its
  // outer ends lift a little with the collarbones when an arm goes up), and the neck between them shares the two.
  const hood = headHold.getObjectByName("cos_hood") as THREE.Mesh | undefined; let skinned: THREE.SkinnedMesh | undefined;
  scene.traverse((o) => { if (!skinned && (o as THREE.SkinnedMesh).isSkinnedMesh) skinned = o as THREE.SkinnedMesh; });
  if (hood && skinned) {
    hood.updateWorldMatrix(true, false); const g = hood.geometry.clone().applyMatrix4(hood.matrixWorld); g.computeVertexNormals(); const pos = g.attributes.position; const sk = skinned.skeleton;
    const joint = (n: string) => sk.bones.findIndex((b) => b.name === n); const jHead = joint("Head"), jChest = joint("spine_03"), jL = joint("clavicle_l"), jR = joint("clavicle_r");
    const index = new Uint16Array(pos.count * 4), weight = new Float32Array(pos.count * 4);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) - neckAt.x, up = THREE.MathUtils.smoothstep(pos.getY(i), chinY - 0.22, chinY - 0.02);
      const arm = jL >= 0 && jR >= 0 ? 0.5 * (1 - up) * THREE.MathUtils.smoothstep(Math.abs(x), 0.3, 0.6) : 0;
      index.set([jHead, jChest, Math.max(0, x > 0 ? jL : jR), 0], i * 4); weight.set([up, 1 - up - arm, arm, 0], i * 4);
    }
    g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(index, 4)); g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(weight, 4));
    const cloth = new THREE.SkinnedMesh(g, hood.material); cloth.name = hood.name; cloth.castShadow = hood.castShadow;
    hood.removeFromParent(); scene.add(cloth); cloth.bind(sk, skinned.bindMatrix.clone());
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
  const coreAround = aroundOf(bodyMeshes(["shirt", "skin", "pants"]), tc.x, tc.z, (v) => Math.abs(v.x) <= armX + 0.02); // the arms left out
  const legsAround = aroundOf(bodyMeshes(["pants"]), tc.x, tc.z); // hips can be wider than the shoulder joints: nothing of them is left out
  const waistY = measure(scene, "pants", () => true).max.y;
  const bodyAround = (angle: number, y: number) => { const c = coreAround(angle, y), l = y > waistY ? null : legsAround(angle, y); return c == null ? l : l == null ? c : Math.max(c, l); };
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
        p.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld); const line = bodyAround(angle, Math.max(p.y, hipY - 0.15)), to = line != null && p.y < hipY - 0.15 && p.y > hipY - 0.55 ? Math.max(line, bodyAround(angle, p.y) ?? 0) : line; // below the hips a robe falls from them, and from the seat and thighs where those are wider still
        if (from == null || to == null) continue;
        const loose = wrapped.tuck == null ? 1 : THREE.MathUtils.smoothstep(wrapped.tuck - y, 0, 0.2);
        const r = to + THREE.MathUtils.lerp(-0.03, wrapped.clear ?? 0.012, loose) // a tucked edge starts inside the clothes, so no gap shows above it
          + (Math.hypot(x, z) - from) * spread * (wrapped.flare ?? 1) * loose;
        p.set(tc.x + r * Math.sin(angle), p.y, tc.z + r * Math.cos(angle)); m.worldToLocal(p); pos.setXYZ(i, p.x, p.y, p.z);
      }
    }
    m.geometry.computeVertexNormals();
  }

  /** Hands a part to a holder (a world-aligned group on a bone) with its geometry given in world space, as it sits at rest. */
  const place = (m: THREE.Mesh, g: THREE.BufferGeometry, hold: THREE.Object3D = torsoHold) => { hold.updateWorldMatrix(true, false); hold.add(m); m.position.set(0, 0, 0); m.quaternion.identity(); m.scale.set(1, 1, 1); m.updateMatrixWorld(true); m.geometry = g.applyMatrix4(m.matrixWorld.clone().invert()); };
  // the belt rides the hips, not the chest (a bow or a seat bends the body between the two)
  const belt = scene.getObjectByName("cos_belt") as THREE.Mesh | undefined;
  if (belt) place(belt, belt.geometry.clone().applyMatrix4(belt.matrixWorld), holder(bone("pelvis"), "hip_parts"));
  // The robe is cloth, not armour: it is skinned to the hips and the legs, each side to its own leg and the middle
  // shared, so it swings with a stride and folds over the lap of a seated figure instead of the legs walking through it.
  const robe = scene.getObjectByName("cos_robe") as THREE.Mesh | undefined; let rigged: THREE.SkinnedMesh | undefined;
  scene.traverse((o) => { if (!rigged && (o as THREE.SkinnedMesh).isSkinnedMesh) rigged = o as THREE.SkinnedMesh; });
  if (robe && rigged) {
    const g = robe.geometry.clone().applyMatrix4(robe.matrixWorld); const pos = g.attributes.position as THREE.BufferAttribute; const sk = rigged.skeleton;
    // Below the hips the robe keeps the hips' width but takes the legs' depth (front to back), a little proud of them
    // and flaring toward the hem: it then lies on the thighs of a seated figure instead of standing up round the lap.
    // Each side also leans out with its leg, which stands apart at rest: the legs stay inside it when they close.
    {
      const legs = bodyMeshes(["pants"]), legFront = frontOf(legs), legBack = frontOf(legs, 0.02, -1);
      const hipAt = new THREE.Vector3().setFromMatrixPosition(bone("thigh_l").matrixWorld), kneeAt = new THREE.Vector3().setFromMatrixPosition(bone("calf_l").matrixWorld), footAt = new THREE.Vector3().setFromMatrixPosition(bone("foot_l").matrixWorld);
      const legX = (y: number) => (y > kneeAt.y ? THREE.MathUtils.mapLinear(y, hipAt.y, kneeAt.y, hipAt.x, kneeAt.x) : THREE.MathUtils.mapLinear(y, kneeAt.y, footAt.y, kneeAt.x, footAt.x));
      const line = hipY - 0.15, front0 = bodyAround(0, line), back0 = bodyAround(Math.PI, line); let hem = Infinity; for (let i = 0; i < pos.count; i++) hem = Math.min(hem, pos.getY(i));
      if (front0 != null && back0 != null) for (let i = 0; i < pos.count; i++) {
        const y = pos.getY(i); if (y >= line) continue;
        pos.setX(i, pos.getX(i) + (legX(y) - legX(line)) * (2 * THREE.MathUtils.smoothstep(pos.getX(i), -0.3, 0.3) - 1));
        const f = legFront(legX(y), y), b = legBack(legX(y), y); if (f == null || b == null) continue;
        const t = THREE.MathUtils.smoothstep(line - y, 0, 0.25), mid0 = tc.z + (front0 - back0) / 2, half0 = (front0 + back0) / 2;
        const half = (f - b) / 2 + 0.03 + (0.06 * (line - y)) / (line - hem);
        pos.setZ(i, THREE.MathUtils.lerp(mid0, (f + b) / 2, t) + (pos.getZ(i) - mid0) * THREE.MathUtils.lerp(1, half / half0, t));
      }
    }
    g.computeVertexNormals();
    const joint = (n: string) => { const i = sk.bones.findIndex((b) => b.name === n); if (i < 0) throw new Error(`assemble: no joint ${n}`); return i; };
    const joints = ["pelvis", "thigh_l", "calf_l", "thigh_r", "calf_r"].map(joint);
    const hip = new THREE.Vector3().setFromMatrixPosition(bone("thigh_l").matrixWorld).y, knee = new THREE.Vector3().setFromMatrixPosition(bone("calf_l").matrixWorld).y;
    const index = new Uint16Array(pos.count * 4), weight = new Float32Array(pos.count * 4);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i);
      const leg = 1 - THREE.MathUtils.smoothstep(y, hip - 0.25, hip + 0.05); // none above the hip joint, all of it a hand below (the trousers under it turn with the thigh from the joint down)
      const shin = 1 - THREE.MathUtils.smoothstep(y, knee - 0.2, knee + 0.1); // below the knee the cloth goes with the shin: any share of the thigh there throws the hem forward when the figure sits
      const left = THREE.MathUtils.smoothstep(x, -0.3, 0.3); // +x is the figure's left; what hangs between the legs is shared, so the two sides do not cross when the legs close
      const w = [1 - leg, leg * left * (1 - shin), leg * left * shin, leg * (1 - left) * (1 - shin), leg * (1 - left) * shin];
      const top = [0, 1, 2, 3, 4].sort((u, v) => w[v] - w[u]).slice(0, 4); const sum = top.reduce((t, k) => t + w[k], 0);
      top.forEach((k, n) => { index[i * 4 + n] = joints[k]; weight[i * 4 + n] = w[k] / sum; });
    }
    g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(index, 4)); g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(weight, 4));
    const cloth = new THREE.SkinnedMesh(g, robe.material); cloth.name = robe.name; cloth.castShadow = robe.castShadow;
    robe.removeFromParent(); scene.add(cloth); cloth.bind(sk, rigged.bindMatrix.clone());
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

  // Parts made for this body rather than refitted: the old shapes (a board of a cape, two balls for shoulder pads, a
  // fat ring of a scarf, pack straps that stop at the chest) do not survive the move to a real figure.
  const at0 = (n: string) => new THREE.Vector3().setFromMatrixPosition(bone(n).matrixWorld);
  /** Replaces a part with a skinned mesh of the same name on the body's skeleton; `weigh` names bones and weights per vertex (rest pose, world space). */
  const skinTo = (part: THREE.Mesh, g: THREE.BufferGeometry, weigh: (v: THREE.Vector3, i: number) => [string, number][]) => {
    const sk = rigged!.skeleton; const pos = g.attributes.position; const index = new Uint16Array(pos.count * 4), weight = new Float32Array(pos.count * 4); const v = new THREE.Vector3(); const ids = new Map<string, number>();
    const id = (n: string) => { let k = ids.get(n); if (k == null) { k = sk.bones.findIndex((b) => b.name === n); if (k < 0) throw new Error(`assemble: no joint ${n}`); ids.set(n, k); } return k; };
    for (let i = 0; i < pos.count; i++) {
      const w = weigh(v.fromBufferAttribute(pos, i), i).filter(([, x]) => x > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4); const sum = w.reduce((t, [, x]) => t + x, 0);
      w.forEach(([n, x], k) => { index[i * 4 + k] = id(n); weight[i * 4 + k] = x / sum; });
    }
    g.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(index, 4)); g.setAttribute("skinWeight", new THREE.Float32BufferAttribute(weight, 4));
    const out = new THREE.SkinnedMesh(g, part.material); out.name = part.name; out.castShadow = part.castShadow;
    part.removeFromParent(); scene.add(out); out.bind(sk, rigged!.bindMatrix.clone());
  };
  const bodyBack = frontOf(bodyMeshes(["shirt", "skin"]), 0.02, -1);

  // The cape is cloth: it starts on the collar at the back of the neck, lies over the shoulders, falls from the
  // shoulder blades and the seat to mid-calf behind the arms, and is skinned to the spine, the hips and (partly) the
  // thighs, so it bends with a bow, gives to a stride and is sat on rather than standing behind the figure like a board.
  const cape = scene.getObjectByName("cos_cape") as THREE.Mesh | undefined;
  if (cape && rigged && collar) {
    const nape = collar.reduce((u, w) => (w.z < u.z ? w : u)).y, shoulder = at0("upperarm_l").y, hipJoint = at0("thigh_l").y, hem = at0("calf_l").y - 0.75 * tall;
    const lean = (at0("calf_l").x - at0("thigh_l").x) / (hipJoint - at0("calf_l").y); // the legs stand apart at rest: what follows a thigh leans out with it
    const ys: number[] = []; for (let y = nape; y > hem + 0.15; y -= y > shoulder - 0.3 ? 0.08 : 0.4) ys.push(y); ys.push(hem);
    const cols = 12, hang = new Array<number>(cols + 1).fill(0), pts: number[] = [], idx: number[] = [];
    ys.forEach((y, row) => {
      const span = THREE.MathUtils.lerp(1.22, 1.5, THREE.MathUtils.smoothstep(y, shoulder - 0.2, shoulder + 0.1)); // over the shoulder tops, then behind the arms
      const low = THREE.MathUtils.clamp((hipJoint - y) / (hipJoint - hem), 0, 1);
      const clear = 0.03 + 0.07 * THREE.MathUtils.smoothstep(shoulder - y, 0.2, shoulder - hipJoint) + 0.24 * low; // clear of a belt and a robe, flaring to the hem
      for (let j = 0; j <= cols; j++) {
        const u = (j / cols) * 2 - 1, a = Math.PI + u * span;
        hang[j] = Math.max(hang[j], bodyAround(a, Math.max(y, hipJoint - 0.3)) ?? 0); // cloth hangs from whatever sticks out furthest above it
        const r = hang[j] + clear + 0.03 * Math.cos(u * Math.PI * 3.5) * THREE.MathUtils.smoothstep(shoulder - y, 0.3, 1.5); // a few soft folds lower down
        pts.push(tc.x + r * Math.sin(a) - 0.45 * lean * Math.max(0, hipJoint - y) * u, y, tc.z + r * Math.cos(a));
        if (row && j) { const k = (row - 1) * (cols + 1) + j - 1; idx.push(k, k + cols + 1, k + 1, k + 1, k + cols + 1, k + cols + 2); }
      }
    });
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3)); g.setIndex(idx); g.computeVertexNormals();
    const pelvisY = at0("pelvis").y, midY = at0("spine_02").y, chestY = at0("spine_03").y + 0.2, kneeY = at0("calf_l").y;
    skinTo(cape, g, (v) => {
      const chest = THREE.MathUtils.smoothstep(v.y, midY, chestY), hips = 1 - THREE.MathUtils.smoothstep(v.y, pelvisY, midY);
      // Below the hips it goes half with the pelvis and half with the small of the back (the pelvis alone tips back in
      // a seat and sweeps it under the legs; the back alone lifts it like a board in a bow), and gives to the legs:
      // to the thigh above the knee and the shin below it, which stays upright whether the figure stands, bows or sits.
      const leg = 0.45 * THREE.MathUtils.smoothstep(hipJoint - v.y, 0.1, 1.2), left = THREE.MathUtils.smoothstep(v.x, -0.35, 0.35), limb = v.y > kneeY ? "thigh" : "calf";
      return [["spine_03", chest], ["spine_02", 1 - chest - hips], ["spine_01", hips * (1 - leg) * 0.5], ["pelvis", hips * (1 - leg) * 0.5], [`${limb}_l`, hips * leg * left], [`${limb}_r`, hips * leg * (1 - left)]];
    });
  }

  // Shoulder pads: two plates a side, as on armour. The upper one lies on the shoulder and rides the collar bone; the
  // lower one cups the top of the arm and turns with it, sliding under the upper when the arm is raised.
  const pads = scene.getObjectByName("cos_pads") as THREE.Mesh | undefined;
  if (pads && rigged) {
    const geos: THREE.BufferGeometry[] = [], owner: string[] = [];
    for (const side of ["l", "r"] as const) {
      const s = side === "l" ? 1 : -1, joint = at0(`upperarm_${side}`), d = at0(`lowerarm_${side}`).sub(joint).normalize(); // "l" is the +x arm
      const n = new THREE.Vector3(-d.y, d.x, 0).normalize(); if (n.y < 0) n.negate(); // across the arm, up and out
      const sleeve = measure(scene, "shirt", (v) => v.distanceTo(joint.clone().addScaledVector(d, 0.3)) < 0.22), ra = (sleeve.max.z - sleeve.min.z) / 2, zc = (sleeve.max.z + sleeve.min.z) / 2;
      const top = measure(scene, "shirt", (v) => Math.abs(v.x - (joint.x - s * ra * 0.6)) < 0.06).max.y; // the shoulder's top, inside the joint
      const z = new THREE.Vector3(0, 0, 1), slope = new THREE.Vector3(s * Math.cos(0.3), -Math.sin(0.3), 0), rise = new THREE.Vector3(s * Math.sin(0.3), Math.cos(0.3), 0);
      const plate = (c: THREE.Vector3, ax: THREE.Vector3, ay: THREE.Vector3, r: [number, number, number], bone: string) => {
        const g = new THREE.SphereGeometry(1, 10, 6).scale(...r).applyMatrix4(new THREE.Matrix4().makeBasis(ax, ay, s > 0 ? z : z.clone().negate())).translate(c.x, c.y, c.z);
        geos.push(g); for (let i = 0; i < g.attributes.position.count; i++) owner.push(bone);
      };
      plate(new THREE.Vector3(joint.x - s * ra * 0.5, top - ra * 0.12, zc), slope, rise, [ra * 1.55, ra * 0.5, ra * 1.3], `clavicle_${side}`);
      plate(joint.clone().addScaledVector(d, ra * 0.7).addScaledVector(n, ra * 0.34).setZ(zc), d, n, [ra * 1.35, ra * 0.9, ra * 1.14], `upperarm_${side}`);
    }
    const g = mergeGeometries(geos, false)!; g.deleteAttribute("uv");
    skinTo(pads, g, (_, i) => [[owner[i], 1]]);
  }

  // The scarf: a band wound once round the neck where the collar is, and two ends of unequal length down the chest.
  const scarf = scene.getObjectByName("cos_scarf") as THREE.Mesh | undefined;
  if (scarf && collar) {
    const c = collar.reduce((t, q) => t.add(q), new THREE.Vector3()).multiplyScalar(1 / collar.length), front = collar.reduce((u, w) => (w.z > u.z ? w : u));
    const turn = (q: THREE.Vector3) => Math.atan2(q.x - c.x, q.z - c.z); const loop = [...collar].sort((u, w) => turn(u) - turn(w)); const n = 14;
    const ring = Array.from({ length: n }, (_, i) => { const q = loop[Math.floor((i / n) * loop.length)], o = new THREE.Vector3(q.x - c.x, 0, q.z - c.z).normalize(); return q.clone().addScaledVector(o, 0.035).setY(q.y + 0.04); });
    const radial = 6, tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ring, true, "centripetal"), 20, 0.07, radial, true), tp = tube.attributes.position as THREE.BufferAttribute;
    // the round tube made a band: taller than it is thick
    for (let i = 0; i < tp.count; i += radial + 1) {
      const mid = new THREE.Vector3(); for (let j = 0; j < radial; j++) mid.add(p.fromBufferAttribute(tp, i + j)); mid.multiplyScalar(1 / radial);
      for (let j = 0; j <= radial; j++) { p.fromBufferAttribute(tp, i + j).sub(mid); tp.setXYZ(i + j, mid.x + p.x * 0.75, mid.y + p.y * 1.3, mid.z + p.z * 0.75); }
    }
    const k = tall, thick = 0.035;
    const ends = [1, -1].map((s) => {
      const len = (s > 0 ? 0.72 : 0.56) * k, w = 0.15, e = new THREE.BoxGeometry(w, len, thick, 2, 6, 1).translate(s * 0.08, front.y + 0.03 - len / 2, 0); const ep = e.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < ep.count; i++) {
        const down = (front.y + 0.03 - ep.getY(i)) / len, x = ep.getX(i) + s * 0.035 * down + c.x; // the ends part a little as they fall
        let f = -Infinity; for (const dx of [-0.03, 0, 0.03]) f = Math.max(f, bodyFront(x + dx, ep.getY(i)) ?? -Infinity);
        ep.setXYZ(i, x, ep.getY(i), (f === -Infinity ? front.z : f) + 0.012 + (ep.getZ(i) > 0 ? thick : 0));
      }
      return e;
    });
    const g = mergeGeometries([tube, ...ends], false)!; g.deleteAttribute("uv"); g.computeVertexNormals(); place(scarf, g);
  }

  // The pack sits against the back, and its harness is real: a strap a side from the belt line up the chest, over the
  // shoulder and down the back into the pack.
  const pack = scene.getObjectByName("cos_pack") as THREE.Mesh | undefined;
  if (pack) {
    const src = pack.geometry.clone().applyMatrix4(pack.matrixWorld).toNonIndexed(); src.computeVertexNormals(); const sp = src.attributes.position, sn = src.attributes.normal; const keptP: number[] = [], keptN: number[] = []; const box = new THREE.Box3();
    for (let i = 0; i < sp.count; i += 3) { // the old chest straps (everything in front of the body's middle) are left out
      if ([0, 1, 2].every((j) => sp.getZ(i + j) > tc.z)) continue;
      for (let j = 0; j < 3; j++) { keptP.push(sp.getX(i + j), sp.getY(i + j), sp.getZ(i + j)); keptN.push(sn.getX(i + j), sn.getY(i + j), sn.getZ(i + j)); box.expandByPoint(p.fromBufferAttribute(sp, i + j)); }
    }
    let back = Infinity; for (let y = box.min.y; y <= box.max.y; y += 0.05) for (const x of [-0.2, 0, 0.2]) back = Math.min(back, bodyBack(tc.x + x, y) ?? Infinity);
    const shift = back === Infinity ? 0 : back - 0.012 - box.max.z; for (let i = 2; i < keptP.length; i += 3) keptP[i] += shift;
    const body = new THREE.BufferGeometry(); body.setAttribute("position", new THREE.Float32BufferAttribute(keptP, 3)); body.setAttribute("normal", new THREE.Float32BufferAttribute(keptN, 3));
    const w = 0.085, thick = 0.022, off = thick / 2 + 0.006, low = hipY + 0.12, X = new THREE.Vector3(1, 0, 0);
    const straps = [1, -1].map((s) => {
      const x = tc.x + s * armX * 0.6, wide = (f: (x: number, y: number) => number | null, y: number, pick: (...v: number[]) => number) => { const v = [-w / 2, 0, w / 2].map((dx) => f(x + dx, y)); return v.some((q) => q == null) ? null : pick(...(v as number[])); };
      const up: THREE.Vector3[] = [], behind: THREE.Vector3[] = []; let crest = low;
      for (let y = low; y < low + 4; y += 0.06) { const f = wide(bodyFront, y, Math.max), b = wide(bodyBack, y, Math.min); if (f == null || b == null || f - b < 0.1) { if (up.length) break; continue; } crest = y; up.push(new THREE.Vector3(x, y, f + off)); behind.push(new THREE.Vector3(x, y, b - off)); }
      if (!up.length) return new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute([], 3)).setAttribute("normal", new THREE.Float32BufferAttribute([], 3));
      const down = behind.filter((q, i) => i === behind.length - 1 || q.y > Math.min(box.max.y, crest) - 0.2);
      const path = [...up, new THREE.Vector3(x, crest + 0.05 + off, (up[up.length - 1].z + down[down.length - 1].z) / 2), ...down.reverse()];
      const line = new THREE.CatmullRomCurve3(path, false, "centripetal").getSpacedPoints(26), g = new THREE.BoxGeometry(w, 1, thick, 1, line.length - 1, 1), gp = g.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < gp.count; i++) {
        const k = Math.round((gp.getY(i) + 0.5) * (line.length - 1)), t = line[Math.min(line.length - 1, k + 1)].clone().sub(line[Math.max(0, k - 1)]).normalize(), nrm = X.clone().cross(t);
        p.copy(line[k]).addScaledVector(X, gp.getX(i)).addScaledVector(nrm, gp.getZ(i)); gp.setXYZ(i, p.x, p.y, p.z);
      }
      const flat = g.toNonIndexed(); flat.deleteAttribute("uv"); flat.computeVertexNormals(); return flat;
    });
    place(pack, mergeGeometries([body, ...straps], false)!);
  }

  // carried props: built tilted into the procedural figure's hanging hand. Each is set back on its own axes and seated
  // in the grip worked out for it on this hand (grip.ts), which is also the pose the runtime closes the fingers into.
  const handHold = new THREE.Group(); handHold.name = "hand_parts"; fist.add(handHold);
  lift(old.getObjectByName("hand_r")!, handHold);
  for (const c of handHold.children) {
    const shape = GRIPS[GRIP_OF[c.name]], held = shape && handGrip(scene, shape); if (!held) continue;
    (c as THREE.Mesh).geometry.translate(-CARRY.offset[0], -CARRY.offset[1], -CARRY.offset[2]).rotateX(-CARRY.tilt);
    c.position.copy(held.position); c.quaternion.copy(held.quaternion);
  }

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
