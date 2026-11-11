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
  lift(oldTorso, torsoShift);

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
