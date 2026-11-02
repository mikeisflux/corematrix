#!/usr/bin/env node
/**
 * Writes the meshopt decoder's WebAssembly out of three's bundled module (which packs it into a string and
 * instantiates it inline, at import time) into public/models as real .wasm files, so the hall can fetch and compile
 * them as a stream. Re-run after upgrading three; the loader is src/lib/hall/meshopt-decoder.ts.
 */
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const src = fs.readFileSync(path.join(root, "node_modules/three/examples/jsm/libs/meshopt_decoder.module.js"), "utf8");
const grab = (name) => {
  const m = src.match(new RegExp(`var ${name} =\\s*'([^']+)'`));
  if (!m) throw new Error(`${name} not found in three's meshopt_decoder.module.js; the file's layout changed`);
  return m[1];
};
const packMatch = src.match(/var wasmpack = new Uint8Array\(\[([^\]]+)\]\)/);
if (!packMatch) throw new Error("wasmpack table not found");
const wasmpack = new Uint8Array(packMatch[1].split(",").map((s) => Number(s.trim())));

// the module's own unpack(), unchanged
function unpack(data) {
  const result = new Uint8Array(data.length);
  for (let i = 0; i < data.length; ++i) {
    const ch = data.charCodeAt(i);
    result[i] = ch > 96 ? ch - 97 : ch > 64 ? ch - 39 : ch + 4;
  }
  let write = 0;
  for (let i = 0; i < data.length; ++i) result[write++] = result[i] < 60 ? wasmpack[result[i]] : (result[i] - 60) * 64 + result[++i];
  return result.slice(0, write);
}

for (const [name, file] of [["wasm_base", "meshopt_decoder.wasm"], ["wasm_simd", "meshopt_decoder_simd.wasm"]]) {
  const bytes = unpack(grab(name));
  if (!WebAssembly.validate(bytes)) throw new Error(`${name} did not unpack to valid WebAssembly`);
  const out = path.join(root, "public/models", file);
  fs.writeFileSync(out, bytes);
  console.log(`${file}: ${bytes.length} bytes`);
}
