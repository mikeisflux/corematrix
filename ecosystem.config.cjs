/* pm2 process file. The app is dist/server.cjs (Next plus the hall's WebSocket, built by `npm run build`).
   One worker unless REDIS_URL is set: the live feed and the floor roster are shared through Redis, and only then can
   several workers serve the same floor. WEB_CONCURRENCY picks how many (default: one per CPU when Redis is on). */
const fs = require("node:fs");
const path = require("node:path");
const env = {};
try { for (const line of fs.readFileSync(path.join(__dirname, ".env"), "utf8").split("\n")) { const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ""); } } catch { /* no .env */ }
const redis = process.env.REDIS_URL || env.REDIS_URL;
const want = Number(process.env.WEB_CONCURRENCY || env.WEB_CONCURRENCY || 0);
const instances = redis ? (want > 0 ? want : "max") : 1;
module.exports = {
  apps: [
    {
      name: "fcc",
      script: "dist/server.cjs",
      cwd: __dirname,
      instances,
      exec_mode: instances === 1 ? "fork" : "cluster",
      autorestart: true,
      max_memory_restart: "1200M",
      kill_timeout: 8000,
      env: { NODE_ENV: "production", PORT: "3000" },
      out_file: "/srv/fcc/logs/out.log",
      error_file: "/srv/fcc/logs/err.log",
      merge_logs: true,
      time: true,
    },
  ],
};
