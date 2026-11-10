// Bundles server/index.ts (the Node server with the WebSocket) into dist/server.cjs. Packages stay external, so the
// bundle only carries our own src/lib modules; they share state with Next's route handlers through globalThis.
import { build } from "esbuild";
import fs from "node:fs";
fs.mkdirSync("dist", { recursive: true });
await build({ entryPoints: ["server/index.ts"], outfile: "dist/server.cjs", bundle: true, platform: "node", format: "cjs", target: "node20", packages: "external", sourcemap: false, logLevel: "warning", define: { "process.env.NEXT_RUNTIME": '"nodejs"' } });
console.log("dist/server.cjs written");
