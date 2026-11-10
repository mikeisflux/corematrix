"use client";
/**
 * The hall's animation clips, re-expressed for a VRM humanoid. Our clips drive the Quaternius rig's bones in their own
 * local spaces; a VRM's normalized humanoid rig has every bone at identity rotation in a T-pose, which is exactly the
 * rest pose our rig stands in. So for each mapped bone the clip is sampled, its world-space rotation delta from rest is
 * taken, and that delta divided by the parent humanoid bone's delta is the VRM bone's local rotation. Done once per
 * avatar file and cached; VrmRig only renames the tracks to a given model's normalized bone nodes.
 */
import * as THREE from "three";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";

/** Our bone → VRM humanoid bone. */
const MAP: Record<string, string> = {
  Body: "hips", Abdomen: "spine", Torso: "chest", Neck: "neck", Head: "head",
  UpperArm_L: "leftUpperArm", LowerArm_L: "leftLowerArm", Fist_L: "leftHand", UpperArm_R: "rightUpperArm", LowerArm_R: "rightLowerArm", Fist_R: "rightHand",
  UpperLeg_L: "leftUpperLeg", LowerLeg_L: "leftLowerLeg", Foot_L: "leftFoot", UpperLeg_R: "rightUpperLeg", LowerLeg_R: "rightLowerLeg", Foot_R: "rightFoot",
};
/** The humanoid parent of each mapped bone (intermediate VRM bones such as upperChest or the shoulders stay at rest). */
const PARENT: Record<string, string | null> = {
  hips: null, spine: "hips", chest: "spine", neck: "chest", head: "neck",
  leftUpperArm: "chest", leftLowerArm: "leftUpperArm", leftHand: "leftLowerArm", rightUpperArm: "chest", rightLowerArm: "rightUpperArm", rightHand: "rightLowerArm",
  leftUpperLeg: "hips", leftLowerLeg: "leftUpperLeg", leftFoot: "leftLowerLeg", rightUpperLeg: "hips", rightLowerLeg: "rightUpperLeg", rightFoot: "rightLowerLeg",
};
const FPS = 30;

export interface HumanoidClips { clips: THREE.AnimationClip[]; hipsHeight: number } // hipsHeight: our rig's hips above the floor (ft), to scale the hips track

const cache = new WeakMap<THREE.Object3D, HumanoidClips>();

export function humanoidClips(scene: THREE.Object3D, clips: THREE.AnimationClip[]): HumanoidClips {
  const hit = cache.get(scene); if (hit) return hit;
  const rig = SkeletonUtils.clone(scene);
  rig.updateMatrixWorld(true);
  const bones = new Map<string, THREE.Object3D>();
  rig.traverse((o) => { if (MAP[o.name]) bones.set(MAP[o.name], o); });
  const rest = new Map<string, THREE.Quaternion>(); const q = new THREE.Quaternion();
  for (const [name, b] of bones) rest.set(name, b.getWorldQuaternion(q.clone()).invert());
  const hipsBone = bones.get("hips")!; const hipsRest = hipsBone.getWorldPosition(new THREE.Vector3());
  const mixer = new THREE.AnimationMixer(rig);
  const out: THREE.AnimationClip[] = [];
  const delta = new Map<string, THREE.Quaternion>(); const p = new THREE.Vector3();
  for (const clip of clips) {
    const action = mixer.clipAction(clip); action.play();
    const n = Math.max(1, Math.round(clip.duration * FPS)); const times: number[] = []; const rot = new Map<string, number[]>(); const pos: number[] = [];
    for (const name of bones.keys()) rot.set(name, []);
    for (let i = 0; i <= n; i++) {
      const t = Math.min(clip.duration, i / FPS); times.push(t);
      mixer.setTime(0); mixer.setTime(t); rig.updateMatrixWorld(true);
      for (const [name, b] of bones) delta.set(name, b.getWorldQuaternion(q.clone()).multiply(rest.get(name)!));
      for (const [name] of bones) {
        const par = PARENT[name]; const d = delta.get(name)!;
        const local = par ? delta.get(par)!.clone().invert().multiply(d) : d.clone();
        rot.get(name)!.push(local.x, local.y, local.z, local.w);
      }
      hipsBone.getWorldPosition(p).sub(hipsRest); pos.push(p.x, p.y, p.z);
    }
    action.stop(); mixer.uncacheClip(clip);
    const tracks: THREE.KeyframeTrack[] = [];
    for (const [name, v] of rot) tracks.push(new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, times, v));
    tracks.push(new THREE.VectorKeyframeTrack("hips.position", times, pos)); // the hips' travel from rest, in feet
    out.push(new THREE.AnimationClip(clip.name, clip.duration, tracks));
  }
  const res = { clips: out, hipsHeight: hipsRest.y };
  cache.set(scene, res); return res;
}
