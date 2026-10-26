// Every booth's stand point (where "walk here" puts you) must be on walkable floor, never inside a neighbour.
import { hallLayout, standPoint } from "@/lib/hall/layout";
const all = hallLayout();
const R = 1.1;
const blocked = (x: number, z: number) => all.some((b) => Math.abs(x - b.x) < b.w / 2 + R && Math.abs(z - b.z) < b.d / 2 + R);
let bad = 0;
for (const b of all) { const sp = standPoint(b.id); if (blocked(sp.x, sp.z)) { bad++; if (bad < 6) console.log("blocked stand point", b.id, b.label, b.size, b.facing, sp); } }
console.log("booths", all.length, "bad", bad);
if (bad) process.exit(1);
