/* pm2 process file. One instance on purpose: the live feed uses an in-process bus. */
module.exports = {
  apps: [
    {
      name: "fcc",
      script: "npm",
      args: "start",
      cwd: __dirname,
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_memory_restart: "1200M",
      env: { NODE_ENV: "production", PORT: "3000" },
      out_file: "/srv/fcc/logs/out.log",
      error_file: "/srv/fcc/logs/err.log",
      merge_logs: true,
      time: true,
    },
  ],
};
