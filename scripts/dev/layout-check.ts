import { hallLayout, HALL_LENGTH, HALL_DEPTH, ARCADE, Z_FRONT, Z_BACK } from "../../src/lib/hall/layout";
const L = hallLayout();
const by = (k: (b: (typeof L)[0]) => string) => { const m = new Map<string, number>(); for (const b of L) m.set(k(b), (m.get(k(b)) ?? 0) + 1); return Object.fromEntries(m); };
console.log("total", L.length, "len", HALL_LENGTH, "depth", HALL_DEPTH, "arcade", ARCADE, "zfront", Z_FRONT, "zback", Z_BACK);
console.log("sizes", by((b) => b.size), "zones", by((b) => b.zone), "halls", by((b) => b.hall));
// overlaps
let ov = 0;
for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) { const a = L[i], b = L[j]; if (Math.abs(a.x - b.x) < (a.w + b.w) / 2 - 0.01 && Math.abs(a.z - b.z) < (a.d + b.d) / 2 - 0.01) { ov++; if (ov < 5) console.log("overlap", a.label, b.label, a, b); } }
console.log("overlaps", ov);
const labels = new Set(L.map((b) => b.label)); console.log("dupe labels", L.length - labels.size);
console.log(L.filter((b) => b.size === "20x20").slice(0, 3), L.find((b) => b.kind === "artist"));
