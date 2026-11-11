/**
 * Finds the usable parts of a motion-capture take: single strides of a steady walk or run that loop cleanly, and calm
 * stretches of standing. Works on the source skeleton, before retargeting.
 */
import { Vector3 } from "three";
import { worlds, rotOf, posOf, angleBetween } from "./rig.mjs";

const SIDES = [["LeftUpLeg", "LeftLeg", "LeftFoot", "LeftArm", "LeftForeArm"], ["RightUpLeg", "RightLeg", "RightFoot", "RightArm", "RightForeArm"]];
const CORE = ["Hips", "LowerBack", "Spine", "Spine1", "Neck1", "Head"];

/** Samples the take every `step` seconds: joint world rotations/positions used to compare poses. */
export function sampleTake(take, step = 1 / 60, names = [...CORE, ...SIDES.flat()]) {
  const { rig, pose, dur } = take; const N = (n) => rig.byName.get(n); const joints = names.map(N).filter(Boolean);
  const out = [];
  for (let t = 0; t <= dur + 1e-9; t += step) {
    const w = worlds(rig, pose(t));
    out.push({ t, hips: posOf(w.get(N("Hips"))), lf: posOf(w.get(N("LeftFoot"))), rf: posOf(w.get(N("RightFoot"))), q: joints.map((j) => rotOf(w.get(j))), local: joints.map((j) => pose(t).get(j).q.clone()) });
  }
  return { frames: out, step };
}
/** How different two frames' poses are (mean joint angle, radians), judged on joint rotations relative to the hips' heading. */
export function poseGap(a, b) {
  let s = 0; for (let i = 1; i < a.local.length; i++) s += angleBetween(a.local[i], b.local[i]);
  // the hips: world rotation, so a turn between the two frames counts
  return (s + 2 * angleBetween(a.q[0], b.q[0])) / (a.local.length + 1) + Math.abs(a.hips.y - b.hips.y) * 0.02;
}
/**
 * Strides of steady straight-line locomotion: from one left foot strike to the next. Each comes with its duration,
 * ground speed (units/s), how much the heading changes across it and how well its two ends match (pose and velocity).
 */
export function findStrides(take, { min = 0.5, max = 1.6 } = {}) {
  const { frames, step } = sampleTake(take); const n = frames.length; if (n < 20) return [];
  const smooth = (arr, r) => arr.map((_, i) => { let s = 0, c = 0; for (let k = Math.max(0, i - r); k <= Math.min(arr.length - 1, i + r); k++) { s += arr[k]; c++; } return s / c; });
  // travel direction around each frame (over ±0.25 s), and the left foot's lead over the hips along it
  const r = Math.round(0.25 / step);
  const lead = frames.map((f, i) => { const a = frames[Math.max(0, i - r)].hips, b = frames[Math.min(n - 1, i + r)].hips; const d = new Vector3(b.x - a.x, 0, b.z - a.z); const len = d.length(); if (len < 1e-6) return 0; d.multiplyScalar(1 / len); return (f.lf.x - f.hips.x) * d.x + (f.lf.z - f.hips.z) * d.z; });
  const s = smooth(lead, 2); const peaks = [];
  for (let i = 2; i < n - 2; i++) if (s[i] > s[i - 1] && s[i] >= s[i + 1] && s[i] > 0) { if (peaks.length && i - peaks[peaks.length - 1] < 0.3 / step) { if (s[i] > s[peaks[peaks.length - 1]]) peaks[peaks.length - 1] = i; } else peaks.push(i); }
  const out = [];
  for (let k = 0; k + 1 < peaks.length; k++) {
    const a = peaks[k]; let best = null;
    // the matching frame is near the next peak: take the closest pose within ±0.06 s of it
    for (let b = Math.max(a + 1, peaks[k + 1] - Math.round(0.06 / step)); b <= Math.min(n - 3, peaks[k + 1] + Math.round(0.06 / step)); b++) {
      const v = Math.round(0.05 / step); if (a - v < 0 || b + v >= n) continue;
      const gap = poseGap(frames[a], frames[b]) + 0.5 * (poseGap(frames[a + v], frames[b + v]) + poseGap(frames[a - v], frames[b - v]));
      if (!best || gap < best.gap) best = { b, gap };
    }
    if (!best) continue; const b = best.b; const dur = (b - a) * step; if (dur < min || dur > max) continue;
    const d = new Vector3(frames[b].hips.x - frames[a].hips.x, 0, frames[b].hips.z - frames[a].hips.z); const dist = d.length();
    // straightness: the path's widest sideways departure from the chord, and the hips' turn between the ends
    let bow = 0; if (dist > 1e-6) { const ux = d.x / dist, uz = d.z / dist; for (let i = a; i <= b; i++) { const px = frames[i].hips.x - frames[a].hips.x, pz = frames[i].hips.z - frames[a].hips.z; bow = Math.max(bow, Math.abs(px * uz - pz * ux)); } }
    out.push({ from: frames[a].t, to: frames[b].t, dur, speed: dist / dur, dist, turn: angleBetween(frames[a].q[0], frames[b].q[0]), bow, gap: best.gap / 2 });
  }
  return out;
}
/** Calm standing: windows of `len` seconds with the least movement, each with how well its two ends match. */
export function findStill(take, len = 4, hop = 0.25) {
  const { frames, step } = sampleTake(take); const w = Math.round(len / step), h = Math.max(1, Math.round(hop / step)); const out = [];
  for (let a = 0; a + w < frames.length; a += h) {
    let move = 0, travel = 0; const o = frames[a].hips;
    for (let i = a + 1; i <= a + w; i++) { move += poseGap(frames[i - 1], frames[i]); travel = Math.max(travel, Math.hypot(frames[i].hips.x - o.x, frames[i].hips.z - o.z)); }
    out.push({ from: frames[a].t, to: frames[a + w].t, move: move / len, travel, gap: poseGap(frames[a], frames[a + w]) });
  }
  return out;
}
