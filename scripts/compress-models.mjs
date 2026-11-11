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
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { weldPrimitive, simplifyPrimitive } from "@gltf-transform/functions";
import { MeshoptSimplifier } from "meshoptimizer";

/**
 * The far-crowd stand-in baked into each avatar (the node "lod": the dressed body in its idle pose as one plain mesh)
 * is drawn once per distant visitor, hundreds of times over, so it is cut down to a few thousand triangles here. The
 * parts it is made of (skin, shirt, trousers, hair, shoes) share no vertices, so each keeps its own colour.
 */
async function simplifyLod(file, triangles = 3200) {
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS); const doc = await io.read(file);
  const node = doc.getRoot().listNodes().find((n) => n.getName() === "lod"); const mesh = node?.getMesh(); if (!mesh) return null;
  await MeshoptSimplifier.ready;
  let before = 0, after = 0;
  for (const prim of mesh.listPrimitives()) {
    weldPrimitive(prim); const n = prim.getIndices().getCount() / 3; before += n;
    if (n > triangles) simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio: triangles / n, error: 0.02 });
    after += prim.getIndices().getCount() / 3;
  }
  await io.write(file, doc);
  return { before, after };
}

const CLI = path.resolve("node_modules/.bin/gltf-transform");
const FILES = ["avatar-a", "avatar-b", "robot"];
const STEPS = [["resample"], ["resize", "--width", "1024", "--height", "1024"], ["webp", "--quality", "82"], ["quantize"], ["meshopt", "--level", "medium"]]; // resize/webp: the exporter writes textures as PNG

for (const name of FILES) {
  const src = path.resolve("public/models", `${name}.glb`);
  if (!fs.existsSync(src)) { console.log(`skip ${name}: not found`); continue; }
  const before = fs.statSync(src).size;
  const lod = name.startsWith("avatar-") ? await simplifyLod(src) : null;
  if (lod) console.log(`${name}: far-crowd stand-in ${lod.before} → ${lod.after} triangles`);
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
