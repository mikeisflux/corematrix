import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import path from "node:path";
import fs from "node:fs";
import * as schema from "./schema";

const url = process.env.DATABASE_URL ?? "file:./data/towerline.db";
const authToken = process.env.DATABASE_AUTH_TOKEN;

const globalForDb = globalThis as unknown as {
  __towerlineClient?: Client;
  __towerlineMigrated?: Promise<void>;
};

if (url.startsWith("file:")) {
  const file = url.slice("file:".length);
  const dir = path.dirname(path.resolve(file));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const client = globalForDb.__towerlineClient ?? createClient({ url, authToken });
globalForDb.__towerlineClient = client;

export const db = drizzle(client, { schema });
export { schema };

/** Idempotent: applies pending migrations once per process. */
export function ensureMigrated(): Promise<void> {
  if (!globalForDb.__towerlineMigrated) {
    globalForDb.__towerlineMigrated = migrate(db, {
      migrationsFolder: path.join(process.cwd(), "drizzle"),
    }).catch((e) => {
      globalForDb.__towerlineMigrated = undefined;
      throw e;
    });
  }
  return globalForDb.__towerlineMigrated;
}
