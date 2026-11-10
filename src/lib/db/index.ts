/**
 * The database: Postgres. DATABASE_URL=postgres://… uses node-postgres (production, a pool); anything else, or
 * nothing, uses PGlite, an embedded Postgres in a folder (pglite:./data/pg by default), so development and tests
 * need no server and run the very same SQL. Whole-number columns are int8: both drivers are told to read them as
 * JS numbers, so counts, sums and timestamps never come back as strings.
 */
import path from "node:path";
import fs from "node:fs";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";
import { seedSuperadmin } from "./seed-admin";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
const url = process.env.DATABASE_URL?.trim() || "pglite:./data/pg";
export const isPostgresServer = /^postgres(ql)?:\/\//.test(url);

const g = globalThis as unknown as { __fccDb?: Db; __fccDbRaw?: unknown; __fccMigrated?: Promise<void> };

function connect(): Db {
  if (isPostgresServer) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Pool, types } = require("pg") as typeof import("pg");
    types.setTypeParser(20, (v: string) => Number(v)); // int8
    types.setTypeParser(1700, (v: string) => Number(v)); // numeric (sums)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { drizzle } = require("drizzle-orm/node-postgres") as typeof import("drizzle-orm/node-postgres");
    const pool = new Pool({ connectionString: url, max: Number(process.env.PG_POOL_MAX || 10), idleTimeoutMillis: 30_000 });
    pool.on("error", (e) => console.error("[pg]", e.message));
    g.__fccDbRaw = pool;
    return drizzle(pool, { schema }) as unknown as Db;
  }
  const dir = path.resolve(url.replace(/^pglite:/, "").replace(/^file:/, "") || "./data/pg");
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PGlite } = require("@electric-sql/pglite") as typeof import("@electric-sql/pglite");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { drizzle } = require("drizzle-orm/pglite") as typeof import("drizzle-orm/pglite");
  const client = new PGlite(dir, { parsers: { 20: (v: string) => Number(v), 1700: (v: string) => Number(v) } });
  g.__fccDbRaw = client;
  return drizzle(client, { schema }) as unknown as Db;
}

export const db: Db = (g.__fccDb ??= connect());
export { schema };

/** Apply pending migrations (no seeding): the copy script needs the tables before any row exists, so the seed cannot take an email the old data brings. */
export async function migrateOnly(): Promise<void> {
      const folder = path.join(process.cwd(), "drizzle");
      if (isPostgresServer) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { migrate } = require("drizzle-orm/node-postgres/migrator") as typeof import("drizzle-orm/node-postgres/migrator");
        const pool = g.__fccDbRaw as import("pg").Pool;
        const lock = await pool.connect();
        try { await lock.query("select pg_advisory_lock(727272)"); await migrate(db as unknown as import("drizzle-orm/node-postgres").NodePgDatabase<typeof schema>, { migrationsFolder: folder }); }
        finally { await lock.query("select pg_advisory_unlock(727272)").catch(() => {}); lock.release(); }
      } else {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { migrate } = require("drizzle-orm/pglite/migrator") as typeof import("drizzle-orm/pglite/migrator");
        await migrate(db as unknown as import("drizzle-orm/pglite").PgliteDatabase<typeof schema>, { migrationsFolder: folder });
      }
}
/** Idempotent: applies pending migrations once per process, then seeds the superadmin. Several workers starting together take turns through an advisory lock. */
export function ensureMigrated(): Promise<void> {
  if (!g.__fccMigrated) {
    g.__fccMigrated = migrateOnly().then(() => seedSuperadmin(db)).catch((e) => { g.__fccMigrated = undefined; throw e; });
  }
  return g.__fccMigrated;
}
