/**
 * Lists what a motion-capture take holds, to choose the clips for a spec:
 *   node scripts/avatars/probe.mjs <take.bvh>...            strides of steady walking or running
 *   node scripts/avatars/probe.mjs --still 4 <take.bvh>...  the calmest standing windows of that many seconds
 */
import path from "node:path";
import { loadBvh, CMU_UNIT_M } from "./lib/bvh.mjs";
import { findStrides, findStill } from "./lib/cycles.mjs";

const args = process.argv.slice(2); const still = args[0] === "--still" ? Number(args.splice(0, 2)[1]) : 0;
for (const file of args) {
  const take = loadBvh(file); console.log(`${path.basename(file)}  ${take.dur.toFixed(2)} s`);
  if (still) for (const w of findStill(take, still).sort((a, b) => a.move + a.gap * 2 - (b.move + b.gap * 2)).slice(0, 5)) console.log(`  still ${w.from.toFixed(2)}-${w.to.toFixed(2)}  movement ${(w.move * 57.3).toFixed(1)} deg/s  drift ${(w.travel * CMU_UNIT_M * 100).toFixed(1)} cm  ends ${(w.gap * 57.3).toFixed(1)} deg`);
  else for (const s of findStrides(take)) console.log(`  stride ${s.from.toFixed(3)}-${s.to.toFixed(3)}  ${s.dur.toFixed(2)} s  ${(s.speed * CMU_UNIT_M).toFixed(2)} m/s  step ${(s.dist * CMU_UNIT_M / 2).toFixed(2)} m  turn ${(s.turn * 57.3).toFixed(1)} deg  bow ${(s.bow * CMU_UNIT_M * 100).toFixed(1)} cm  ends ${(s.gap * 57.3).toFixed(1)} deg`);
}
