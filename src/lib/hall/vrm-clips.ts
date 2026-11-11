"use client";
/**
 * The hall's animation clips, re-expressed for a VRM humanoid. Our clips drive our rig's bones in their own local
 * spaces; a VRM's normalized humanoid rig has every bone at identity rotation in a T-pose. So for each mapped bone the
 * clip is sampled, its world-space rotation away from the T-pose is taken, and that turn divided by the parent humanoid
 * bone's is the VRM bone's local rotation. Our figure rests with its arms out and down and the forearms forward, not in
 * a T-pose, so each limb's T-pose orientation is worked out first from where its joints sit (see tPose). Done once per
 * avatar file and cached; VrmRig only renames the tracks to a given model's normalized bone nodes.
 */
import * as THREE from "three";
import * as SkeletonUtils from "three/examples/jsm/utils/SkeletonUtils.js";

/** Our bone → VRM humanoid bone. */
const MAP: Record<string, string> = {
  // MakeHuman's game rig (Unreal-style names)
  Head: "head", pelvis: "hips", spine_01: "spine", spine_03: "chest", neck_01: "neck",
  upperarm_l: "leftUpperArm", lowerarm_l: "leftLowerArm", hand_l: "leftHand", upperarm_r: "rightUpperArm", lowerarm_r: "rightLowerArm", hand_r: "rightHand",
  thigh_l: "leftUpperLeg", calf_l: "leftLowerLeg", foot_l: "leftFoot", thigh_r: "rightUpperLeg", calf_r: "rightLowerLeg", foot_r: "rightFoot",
};
/** The humanoid parent of each mapped bone (intermediate VRM bones such as upperChest or the shoulders stay at rest). */
const PARENT: Record<string, string | null> = {
  hips: null, spine: "hips", chest: "spine", neck: "chest", head: "neck",
  leftUpperArm: "chest", leftLowerArm: "leftUpperArm", leftHand: "leftLowerArm", rightUpperArm: "chest", rightLowerArm: "rightUpperArm", rightHand: "rightLowerArm",
  leftUpperLeg: "hips", leftLowerLeg: "leftUpperLeg", leftFoot: "leftLowerLeg", rightUpperLeg: "hips", rightLowerLeg: "rightUpperLeg", rightFoot: "rightLowerLeg",
};
const FPS = 30;

/**
 * A T-pose for our rig, as the world rotation each limb bone would have in it: the bone laid along the T-pose
 * direction with its bend axis (elbow, knee) or the hand's width where a T-pose puts them. `chain` names the limb's
 * three joints (the bend axis is read off them); a hand uses its index and little finger knuckles instead.
 */
const LIMBS: { bone: string; to: string; chain?: [string, string, string]; across?: [string, string]; dir: [number, number, number]; axis: [number, number, number] }[] = (["l", "r"] as const).flatMap((l) => {
  const x = l === "l" ? 1 : -1; const arm: [string, string, string] = [`upperarm_${l}`, `lowerarm_${l}`, `hand_${l}`], leg: [string, string, string] = [`thigh_${l}`, `calf_${l}`, `foot_${l}`];
  return [
    { bone: `upperarm_${l}`, to: `lowerarm_${l}`, chain: arm, dir: [x, 0, 0], axis: [0, -x, 0] }, { bone: `lowerarm_${l}`, to: `hand_${l}`, chain: arm, dir: [x, 0, 0], axis: [0, -x, 0] },
    { bone: `hand_${l}`, to: `middle_01_${l}`, across: [`index_01_${l}`, `pinky_01_${l}`], dir: [x, 0, 0], axis: [0, 0, -1] },
    { bone: `thigh_${l}`, to: `calf_${l}`, chain: leg, dir: [0, -1, 0], axis: [1, 0, 0] }, { bone: `calf_${l}`, to: `foot_${l}`, chain: leg, dir: [0, -1, 0], axis: [1, 0, 0] },
  ];
});
function tPose(rig: THREE.Object3D): Map<string, THREE.Quaternion> {
  const out = new Map<string, THREE.Quaternion>();
  const at = (n: string) => { const o = rig.getObjectByName(n); return o ? o.getWorldPosition(new THREE.Vector3()) : null; };
  const frame = (d: THREE.Vector3, n: THREE.Vector3) => { const y = n.clone().addScaledVector(d, -n.dot(d)).normalize(); return new THREE.Matrix4().makeBasis(d, y, d.clone().cross(y)); };
  for (const L of LIMBS) {
    const bone = rig.getObjectByName(L.bone); const a = at(L.bone), b = at(L.to); if (!bone || !a || !b) continue;
    const d = b.clone().sub(a).normalize(); let n: THREE.Vector3 | null = null;
    if (L.chain) { const [p, q, r] = L.chain.map(at); if (p && q && r) { const u = q.clone().sub(p), v = r.clone().sub(q); n = u.clone().cross(v); if (n.length() < 0.035 * u.length() * v.length()) n = null; } } // a dead-straight limb has no bend to read
    else if (L.across) { const [i, k] = L.across.map(at); if (i && k) n = k.clone().sub(i); }
    const axis = new THREE.Vector3(...L.axis), dir = new THREE.Vector3(...L.dir);
    // the turn that lays this bone's rest frame on the T-pose frame, applied to its rest rotation
    const turn = new THREE.Quaternion().setFromRotationMatrix(frame(dir, axis).multiply(frame(d, n ?? axis).transpose()));
    out.set(L.bone, turn.multiply(bone.getWorldQuaternion(new THREE.Quaternion())));
  }
  return out;
}

export interface HumanoidClips { clips: THREE.AnimationClip[]; hipsHeight: number } // hipsHeight: our rig's hips above the floor (ft), to scale the hips track

const cache = new WeakMap<THREE.Object3D, HumanoidClips>();

export function humanoidClips(scene: THREE.Object3D, clips: THREE.AnimationClip[]): HumanoidClips {
  const hit = cache.get(scene); if (hit) return hit;
  const rig = SkeletonUtils.clone(scene);
  rig.updateMatrixWorld(true);
  const bones = new Map<string, THREE.Object3D>();
  rig.traverse((o) => { if (MAP[o.name]) bones.set(MAP[o.name], o); });
  const rest = new Map<string, THREE.Quaternion>(); const q = new THREE.Quaternion(); const limbs = tPose(rig);
  for (const [name, b] of bones) rest.set(name, (limbs.get(b.name) ?? b.getWorldQuaternion(q.clone())).clone().invert());
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
