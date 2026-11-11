/**
 * How the +x hand (hand_l on the real rig) holds a carried prop: where the prop sits in the fist and how the fingers
 * close round it. One description per prop serves both ends: assemble.ts seats the prop mesh in the hand with it, and
 * the runtime lays the finger pose over whatever the clips play, which only ever carry a relaxed open hand.
 */
import * as THREE from "three";
import { COSTUMES, isCostumeId } from "../costumes";

const FINGERS = ["index", "middle", "ring", "pinky"] as const;
export interface GripShape {
  /** the point of the prop that sits in the middle of the fist, in the prop's own frame (+z along the blade or barrel, +y up) */
  at: [number, number, number];
  /** the prop axis that runs through the fist and out past the thumb: z for a hilt or a stick, y for a pistol grip */
  through: "z" | "y";
  /** how thick the handle is (its radius, feet) */
  radius: number;
  /** degrees the thumb-side end leans toward the fingertips; a hanging arm points that end forward, so this dips it */
  tilt: number;
  /** degrees that end (a pistol's barrel instead) leans away from the palm, which on a hanging arm is out from the leg */
  lean: number;
  /** where the handle crosses the palm: the fraction of the way from the wrist to the knuckles */
  along: number;
  /** degrees the fist rolls thumb-up while its owner sits: a hand laid flat on the thigh would lay a long blade across the body */
  seated?: number;
  /** how far a finger closes, 1 = wrapped right round the handle; fingers not named close fully */
  close?: Partial<Record<(typeof FINGERS)[number], number>>;
  /** the thumb's first joint: degrees swung in front of the palm and degrees closed toward the forefinger; the rest of it wraps the handle */
  thumb: [number, number];
}

/** Flesh between a joint and the skin, feet: under the palm, and under a finger or the thumb. */
const PALM = 0.035, FINGER = 0.022;

export const GRIPS: Record<string, GripShape> = {
  // a full fist round the hilt, thumb over the fingers; the blade leaves by the thumb, forward and a little down
  cos_saber: { at: [0, 0, 0.1], through: "z", radius: 0.062, tilt: 8, lean: 12, along: 0.72, seated: 75, thumb: [40, 20] },
  // a wand is thin and held lightly: the forefinger lies half along it
  cos_wand: { at: [0, 0, 0.14], through: "z", radius: 0.035, tilt: 20, lean: 8, along: 0.76, close: { index: 0.6 }, thumb: [36, 26] },
  // the pistol grip in the fist, the body over the thumb and the barrel pointing where the forearm does
  cos_blaster: { at: [0, -0.19, 0.1], through: "y", radius: 0.06, tilt: -12, lean: 12, along: 0.74, thumb: [40, 22] },
};
/** Meshes that ride with a carried prop (its blade, its glowing tip) sit in the same grip. */
export const GRIP_OF: Record<string, string> = { cos_saber: "cos_saber", cos_saber_blade: "cos_saber", cos_wand: "cos_wand", cos_blaster: "cos_blaster", cos_blaster_tip: "cos_blaster" };

export interface HandGrip { position: THREE.Vector3; quaternion: THREE.Quaternion; fingers: Map<string, THREE.Quaternion>; /** the seated roll, a turn in hand_l's own frame */ seated: THREE.Quaternion | null }

/**
 * The grip worked out on a figure standing in its rest pose: the prop's place in hand_l's own frame, and the local
 * rotation of each finger joint. Null on a rig without the hand's joints.
 */
export function handGrip(root: THREE.Object3D, shape: GripShape): HandGrip | null {
  root.updateWorldMatrix(true, true);
  const node = (n: string) => root.getObjectByName(n);
  const at = (n: string) => { const b = node(n); return b ? new THREE.Vector3().setFromMatrixPosition(b.matrixWorld) : null; };
  const hand = node("hand_l"), wrist = at("hand_l"), knuckle = at("middle_01_l"), index = at("index_01_l"), pinky = at("pinky_01_l");
  if (!hand || !wrist || !knuckle || !index || !pinky) return null;
  const d = knuckle.clone().sub(wrist); const length = d.length(); d.normalize(); // along the hand
  const across = pinky.clone().sub(index); across.addScaledVector(d, -across.dot(d)).normalize(); // forefinger to little finger, squared up
  const palm = across.clone().cross(d).normalize(); // out of the palm
  const DEG = Math.PI / 180;

  // the handle lies across the palm just short of the knuckles, its thumb-side end leaning toward the fingertips
  const t = shape.tilt * DEG; const l = shape.lean * DEG, stick = shape.through === "z";
  const through = across.clone().multiplyScalar(-Math.cos(t)).addScaledVector(d, Math.sin(t)).multiplyScalar(stick ? Math.cos(l) : 1).addScaledVector(palm, stick ? -Math.sin(l) : 0);
  const up = palm.clone().addScaledVector(through, -palm.dot(through)).normalize(); // out of the palm, squared up to the handle
  const basis = new THREE.Matrix4();
  if (stick) basis.makeBasis(up.clone().cross(through), up, through);
  else { const z = through.clone().cross(up).multiplyScalar(Math.cos(l)).addScaledVector(palm, -Math.sin(l)); basis.makeBasis(through.clone().cross(z), through, z); }
  const handQ = hand.getWorldQuaternion(new THREE.Quaternion());
  const quaternion = handQ.clone().invert().multiply(new THREE.Quaternion().setFromRotationMatrix(basis));
  const middle = index.clone().lerp(pinky, 0.5); // the handle is centred on the width of the palm
  const seat = wrist.clone().addScaledVector(d, length * shape.along).addScaledVector(across, middle.sub(wrist).dot(across)).addScaledVector(palm, shape.radius + PALM);
  const position = hand.worldToLocal(seat.clone()).sub(new THREE.Vector3(...shape.at).applyQuaternion(quaternion));
  const off = (p: THREE.Vector3) => { const v = p.clone().sub(seat); return v.addScaledVector(through, -v.dot(through)).length(); }; // how far a point is from the handle's middle line

  // A finger is closed joint by joint, each turned until the joint after it comes down on the handle. `aim` gives the
  // axis a joint turns about; the turns are found on the posed finger and written back as local rotations, each
  // carried through the turns of the joints before it into the joint's own rest frame.
  const fingers = new Map<string, THREE.Quaternion>();
  const wrap = (names: string[], reach: number, amount: number, aim: (k: number, pts: THREE.Vector3[]) => THREE.Vector3, first?: THREE.Quaternion) => {
    const bones = names.map(node), pts = names.map(at); if (bones.some((b) => !b) || pts.some((p) => !p)) return;
    const chain = pts as THREE.Vector3[]; chain.push(chain[2].clone().addScaledVector(chain[2].clone().sub(chain[1]), 0.8)); // the fingertip
    const done = new THREE.Quaternion(); // the turns so far
    names.forEach((name, k) => {
      let turn = first && k === 0 ? first : null;
      if (!turn) {
        const axis = aim(k, chain).normalize(); const arm = chain[k + 1].clone().sub(chain[k]); const q = new THREE.Quaternion();
        let best = 0, bestOff = Infinity;
        for (let deg = 0; deg <= 105; deg += 3) { // the first angle that lands the next joint on the handle, or the nearest it gets
          const o = off(chain[k].clone().add(arm.clone().applyQuaternion(q.setFromAxisAngle(axis, deg * DEG))));
          if (o < bestOff) { best = deg; bestOff = o; } if (o <= reach) break;
        }
        turn = new THREE.Quaternion().setFromAxisAngle(axis, best * amount * DEG);
      }
      for (let i = k + 1; i < chain.length; i++) chain[i].sub(chain[k]).applyQuaternion(turn).add(chain[k]);
      const b = bones[k]!; const w = b.getWorldQuaternion(new THREE.Quaternion());
      const rest = done.clone().invert().multiply(turn).multiply(done); // the same turn before the earlier joints moved
      fingers.set(name, b.quaternion.clone().multiply(w.clone().invert().multiply(rest).multiply(w)).normalize());
      done.premultiply(turn);
    });
  };
  for (const f of FINGERS) wrap([1, 2, 3].map((k) => `${f}_0${k}_l`), shape.radius + FINGER, shape.close?.[f] ?? 1, (_, p) => { const dir = p[1].clone().sub(p[0]).normalize(); return dir.clone().cross(across.clone().cross(dir)); });
  // the thumb swings in front of the palm, then bends down onto the handle beside the forefinger
  const t1 = at("thumb_01_l"), t2 = at("thumb_02_l");
  if (t1 && t2) {
    const dir = t2.sub(t1).normalize(); const over = dir.clone().cross(palm).normalize(), inward = dir.clone().cross(index.clone().sub(t1)).normalize();
    const swing = new THREE.Quaternion().setFromAxisAngle(over, shape.thumb[0] * DEG).multiply(new THREE.Quaternion().setFromAxisAngle(inward, shape.thumb[1] * DEG));
    const down = (k: number, p: THREE.Vector3[]) => { const v = seat.clone().sub(p[k]); v.addScaledVector(through, -v.dot(through)); return p[k + 1].clone().sub(p[k]).cross(v); };
    wrap([1, 2, 3].map((k) => `thumb_0${k}_l`), shape.radius + FINGER, 1, down, swing);
  }
  const seated = shape.seated ? new THREE.Quaternion().setFromAxisAngle(d.clone().applyQuaternion(handQ.clone().invert()), -shape.seated * DEG) : null;
  return { position, quaternion, fingers, seated };
}

/** The prop a costume carries, if it carries one. */
export function carriedProp(costume: string | undefined): string | null {
  if (!isCostumeId(costume)) return null;
  return COSTUMES[costume].parts.find((p) => Object.hasOwn(GRIPS, p)) ?? null;
}

/** A figure's hold on its prop: the finger joints with the rotations that close them, and the hand with its seated roll. */
export interface Hold { joints: [THREE.Object3D, THREE.Quaternion][]; hand: THREE.Object3D | null; seated: THREE.Quaternion | null; sitting: number; base: THREE.Quaternion; wrote: THREE.Quaternion }

const grips = new WeakMap<THREE.Object3D, Map<string, HandGrip | null>>();
/**
 * How `figure` (a clone of `source`) holds its costume's prop, or null when it carries none. The grip is worked out
 * once per model from the untouched source, which stands in its rest pose.
 */
export function holdFor(source: THREE.Object3D, figure: THREE.Object3D, costume: string | undefined): Hold | null {
  const prop = carriedProp(costume); if (!prop) return null;
  let byProp = grips.get(source); if (!byProp) grips.set(source, (byProp = new Map()));
  if (!byProp.has(prop)) byProp.set(prop, handGrip(source, GRIPS[prop]));
  const grip = byProp.get(prop); if (!grip) return null;
  const joints: [THREE.Object3D, THREE.Quaternion][] = [];
  for (const [name, q] of grip.fingers) { const b = figure.getObjectByName(name); if (b) joints.push([b, q]); }
  return { joints, hand: figure.getObjectByName("hand_l") ?? null, seated: grip.seated, sitting: 0, base: new THREE.Quaternion(), wrote: new THREE.Quaternion(0, 0, 0, 0) };
}

const roll = new THREE.Quaternion(), still = new THREE.Quaternion();
/**
 * Lays the hold over the pose the mixer has just written: the clips only know an open hand. Run after each mixer
 * step; a handful of quaternion copies per figure.
 */
export function applyHold(hold: Hold, sitting: boolean, dt: number) {
  for (const [bone, q] of hold.joints) bone.quaternion.copy(q);
  if (!hold.hand || !hold.seated) return;
  hold.sitting += ((sitting ? 1 : 0) - hold.sitting) * Math.min(1, dt * 8);
  if (hold.sitting < 0.001) return;
  // the mixer leaves a joint alone on a frame where its value did not change, so the roll goes on the pose it last wrote, not on top of itself
  if (!hold.hand.quaternion.equals(hold.wrote)) hold.base.copy(hold.hand.quaternion);
  hold.hand.quaternion.copy(hold.base).multiply(roll.copy(still).slerp(hold.seated, hold.sitting));
  hold.wrote.copy(hold.hand.quaternion);
}
