// Compress the animated GLBs for the wire: keyframe resampling, 16-bit vertex quantization (KHR_mesh_quantization) and
// EXT_meshopt_compression. Every loader in the hall goes through useModel() in src/components/hall/models.tsx, which
// carries the decoder. Run after `npm run models` regenerates the files.
//
// Only the three big animated models are compressed. The props (tables, chairs, cabinets, lights) stay as exported:
// the arcade bakes the cabinet's geometry into world space and merges it, which a normalised 16-bit position attribute
// can't survive, and they are a few KB each anyway.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const CLI = path.resolve("node_modules/.bin/gltf-transform");
const FILES = ["avatar-a", "avatar-b", "robot"];
const STEPS = [["resample"], ["quantize"], ["meshopt", "--level", "medium"]];

for (const name of FILES) {
  const src = path.resolve("public/models", `${name}.glb`);
  if (!fs.existsSync(src)) { console.log(`skip ${name}: not found`); continue; }
  const before = fs.statSync(src).size;
  let input = src;
  for (let i = 0; i < STEPS.length; i++) {
    const out = `${src}.step${i}.glb`; // the extension picks the format: anything else and the CLI writes text glTF
    const r = spawnSync(CLI, [STEPS[i][0], input, out, ...STEPS[i].slice(1)], { stdio: ["ignore", "ignore", "inherit"] });
    if (r.status !== 0) { console.error(`${name}: ${STEPS[i][0]} failed`); process.exit(1); }
    if (i > 0) fs.unlinkSync(input);
    input = out;
  }
  fs.renameSync(input, src);
  console.log(`${name}.glb  ${(before / 1024).toFixed(0)} KB → ${(fs.statSync(src).size / 1024).toFixed(0)} KB`);
}
