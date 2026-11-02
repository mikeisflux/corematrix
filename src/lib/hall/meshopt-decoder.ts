/**
 * The meshopt decoder for the compressed GLBs (scripts/compress-models.mjs), loaded from a real .wasm file.
 *
 * three ships the same decoder packed into a string that is unpacked and instantiated inline at import time. That
 * costs a base64-ish blob in the JavaScript bundle, blocks on compiling it before the first model can be asked for,
 * and gives the module no URL: Firefox's devtools try to resolve a source map for "wasm:<chunk> line 38 >
 * WebAssembly.instantiate" and log an error. Here the bytes live in public/models (written by
 * scripts/dev/extract-meshopt-wasm.mjs), are preloaded with the models, and compile as they stream in.
 *
 * Decoding logic is the module's own (meshoptimizer, MIT, Arseny Kapoulkine). Workers are not used.
 */
import type { MeshoptDecoder as Decoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

const BASE = "/models/meshopt_decoder.wasm";
const SIMD = "/models/meshopt_decoder_simd.wasm";
/** A tiny module using SIMD instructions: if it validates, the browser can run the SIMD build. */
const detector = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 4, 1, 96, 0, 0, 3, 3, 2, 0, 0, 5, 3, 1, 0, 1, 12, 1, 0, 10, 22, 2, 12, 0, 65, 0, 65, 0, 65, 0, 252, 10, 0, 0, 11, 7, 0, 65, 0, 253, 15, 26, 11]);

type Exports = { memory: WebAssembly.Memory; sbrk: (n: number) => number; __wasm_call_ctors: () => void } & Record<string, (...a: number[]) => number>;
let exports: Exports | null = null;

const supported = typeof WebAssembly === "object" && typeof window !== "undefined";
export const simd = supported && WebAssembly.validate(detector);
export const wasmUrl = simd ? SIMD : BASE;

async function load(): Promise<void> {
  const res = await fetch(wasmUrl);
  if (!res.ok) throw new Error(`meshopt decoder: ${res.status} for ${wasmUrl}`);
  const streaming = "instantiateStreaming" in WebAssembly && (res.headers.get("content-type") ?? "").includes("application/wasm");
  const result = streaming ? await WebAssembly.instantiateStreaming(res, {}) : await WebAssembly.instantiate(await res.arrayBuffer(), {});
  exports = result.instance.exports as Exports;
  exports.__wasm_call_ctors();
}
const ready: Promise<void> = supported ? load() : Promise.resolve();
ready.catch(() => { /* reported where a model asks for it: GLTFLoader rejects, and the prop falls back to primitives */ });

function decode(fun: string, target: Uint8Array, count: number, size: number, source: Uint8Array, filter?: string) {
  if (!exports) throw new Error("meshopt decoder not ready");
  const sbrk = exports.sbrk;
  const count4 = (count + 3) & ~3;
  const tp = sbrk(count4 * size);
  const sp = sbrk(source.length);
  const heap = new Uint8Array(exports.memory.buffer);
  heap.set(source, sp);
  const res = exports[fun](tp, count, size, sp, source.length);
  if (res === 0 && filter) exports[filter](tp, count4, size);
  target.set(heap.subarray(tp, tp + count * size));
  sbrk(tp - sbrk(0));
  if (res !== 0) throw new Error("Malformed buffer data: " + res);
}

const filters: Record<string, string> = { NONE: "", OCTAHEDRAL: "meshopt_decodeFilterOct", QUATERNION: "meshopt_decodeFilterQuat", EXPONENTIAL: "meshopt_decodeFilterExp", COLOR: "meshopt_decodeFilterColor" };
const decoders: Record<string, string> = { ATTRIBUTES: "meshopt_decodeVertexBuffer", TRIANGLES: "meshopt_decodeIndexBuffer", INDICES: "meshopt_decodeIndexSequence" };

export const MeshoptDecoder: typeof Decoder = {
  ready,
  supported,
  useWorkers() { /* decoding stays on the main thread: the hall's models are small */ },
  decodeVertexBuffer(target, count, size, source, filter) { decode("meshopt_decodeVertexBuffer", target, count, size, source, filters[filter ?? "NONE"]); },
  decodeIndexBuffer(target, count, size, source) { decode("meshopt_decodeIndexBuffer", target, count, size, source); },
  decodeIndexSequence(target, count, size, source) { decode("meshopt_decodeIndexSequence", target, count, size, source); },
  decodeGltfBuffer(target, count, size, source, mode, filter) { decode(decoders[mode], target, count, size, source, filters[filter ?? "NONE"]); },
  decodeGltfBufferAsync(count, size, source, mode, filter) {
    return ready.then(() => { const target = new Uint8Array(count * size); decode(decoders[mode], target, count, size, source, filters[filter ?? "NONE"]); return target; });
  },
};
