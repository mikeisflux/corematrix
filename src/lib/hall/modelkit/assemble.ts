"use client";
/**
 * Assembles the hall's avatar GLBs (npm run models, via /dev/models) from two sources:
 *
 *  - the skinned, animated body in models-src/body-{a,b}.anim.glb: a Quaternius "Ultimate Animated Character" (CC0)
 *    converted by scripts/avatars/usd-to-glb.py, with five hair styles from the same pack and the clips retargeted by
 *    scripts/avatars/retarget.mjs (KayKit Adventurers walk/run/idle/sit/cheer/bow/point, the project's own emotes);
 *  - the costume parts, badge and lanyard of the procedural figure in ./avatar.ts (node names cos_*, badge, lanyard_m),
 *    which are lifted off that figure and refit onto the new bones: head parts scaled to the new head, chest parts to
 *    the new torso, carried props into the hand. The runtime (applyAvatarLook) keeps toggling them by name.
 *
 * It also bakes a low-detail copy of the body in its idle pose ("lod": one plain mesh with a _part attribute telling
 * skin from shirt from pants…) that the far crowd draws as instances instead of a skinned rig each.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
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

export interface Assembled { scene: THREE.Group; clips: THREE.AnimationClip[] }

export async function assembleAvatar(body: BodyType, url: string): Promise<Assembled> {
  const gltf = await new GLTFLoader().loadAsync(url);
  const scene = gltf.scene as THREE.Group; scene.name = `avatar-${body}`;
  scene.updateMatrixWorld(true);
  const bone = (n: string) => { const b = scene.getObjectByName(n); if (!b) throw new Error(`assemble: no bone ${n}`); return b; };
  const head = bone("Head"), torso = bone("Torso"), fist = bone("Fist_L"); // Fist_L is at +x, where the procedural figure's "hand_r" was
  const old = buildAvatar(body);
  old.updateMatrixWorld(true);

  // head parts: the procedural head sphere → the new head. Two fits: coverings (cowl, helmet, hood, hat, antenna) get a
  // sphere that encloses the boxy head, so its corners never poke through; face pieces (mask, shades, earpiece) a tight
  // one. Both keep the old eye line on the new eyes and the old crown on the new crown, so hats sit and masks line up.
  const headPos = new THREE.Vector3().setFromMatrixPosition(head.matrixWorld);
  const hb = measure(scene, "skin", (v) => v.y > headPos.y - 0.25 && Math.abs(v.x) < 1.3);
  const hc = hb.getCenter(new THREE.Vector3()), hr = hb.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  const eyeY = measure(scene, "eye", () => true).getCenter(new THREE.Vector3()).y;
  const OLD_EYE = OLD_HEAD_C.y + 0.1, OLD_TOP = OLD_HEAD_C.y + OLD_HEAD_R.y;
  const headHold = holder(head, "head_parts");
  const headFit = (name: string, padX: number, padZ: number) => {
    const fit = new THREE.Group(); fit.name = name;
    const sy = (hb.max.y + 0.02 - eyeY) / (OLD_TOP - OLD_EYE);
    fit.scale.set((hr.x + padX) / OLD_HEAD_R.x, sy, (hr.z + padZ) / OLD_HEAD_R.z);
    fit.position.set(hc.x - headPos.x, eyeY - sy * (OLD_EYE - OLD_HEAD_C.y) - headPos.y, hc.z - headPos.z); // old head centre lands here
    const shift = new THREE.Group(); shift.position.copy(OLD_HEAD_C).negate();
    headHold.add(fit); fit.add(shift); return shift;
  };
  const cover = headFit("head_cover", 0.16, 0.2), face = headFit("head_face", 0.03, 0.05);
  const oldHead = old.getObjectByName("head")!;
  for (const c of [...oldHead.children]) {
    if (!(c as THREE.Mesh).isMesh || !c.name.startsWith("cos_")) continue;
    (["cos_mask", "cos_shades", "cos_earpiece"].includes(c.name) ? face : cover).add(c);
  }

  // chest parts: the procedural torso (its own shirt mesh, torso_m) → the new shirt's core (sleeves left out)
  const oldTorso = old.getObjectByName("torso")!, oldShirt = old.getObjectByName("torso_m") as THREE.Mesh;
  oldShirt.geometry.computeBoundingBox(); const ob = oldShirt.geometry.boundingBox!;
  const oc = ob.getCenter(new THREE.Vector3()), or = ob.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  const tb = measure(scene, "shirt", (v) => Math.abs(v.x) < 0.62); // the sleeves start where the upper arm bones do
  const tc = tb.getCenter(new THREE.Vector3()), tr = tb.getSize(new THREE.Vector3()).multiplyScalar(0.5).add(new THREE.Vector3(0.08, 0, 0.1)); // a little proud of the shirt
  const torsoHold = holder(torso, "torso_parts");
  const torsoFit = new THREE.Group(); torsoFit.name = "torso_fit";
  torsoFit.position.copy(tc).sub(new THREE.Vector3().setFromMatrixPosition(torso.matrixWorld));
  torsoFit.scale.set(tr.x / or.x, tr.y / or.y, tr.z / or.z);
  const torsoShift = new THREE.Group(); torsoShift.position.copy(oc).negate();
  torsoHold.add(torsoFit); torsoFit.add(torsoShift);
  lift(oldTorso, torsoShift);

  // carried props: built for a hand hanging down (-y along the arm); the new arm rests along +x
  const handHold = holder(fist, "hand_parts", new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2));
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
