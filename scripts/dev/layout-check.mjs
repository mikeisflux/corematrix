// Prints the plan hash (ids, numbers, kinds, sizes, zones, halls, prices of every space) and compares it with
// PLAN_HASH in src/lib/hall/layout.ts. Run it after touching the layout: exhibitors own these ids.
//   node scripts/dev/layout-check.mjs
import { spawnSync } from "node:child_process";
const r = spawnSync("npx", ["tsx", "-e", `
import { hallLayout, PLAN_HASH } from "./src/lib/hall/layout";
import { createHash } from "node:crypto";
const rows = hallLayout().map((b) => b.id + "|" + b.label + "|" + b.kind + "|" + b.size + "|" + b.zone + "|" + b.hall + "|" + b.priceCents);
const h = createHash("sha1").update(rows.join("\\n")).digest("hex");
console.log(rows.length + " spaces, plan hash " + h + (h === PLAN_HASH ? " (matches PLAN_HASH)" : " DOES NOT MATCH PLAN_HASH " + PLAN_HASH + ": booths would change hands"));
process.exit(h === PLAN_HASH ? 0 : 1);
`], { stdio: "inherit" });
process.exit(r.status ?? 1);
