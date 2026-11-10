/**
 * One-time move of the data from the old SQLite file into Postgres.
 *
 *   DATABASE_URL=postgres://fcc:…@127.0.0.1:5432/forevercomiccon npm run db:copy -- data/forevercomiccon.db
 *
 * Reads every table the schema knows from the SQLite file, converts what the dialects disagree on (0/1 → booleans,
 * blobs), and inserts in batches, skipping rows that are already there (safe to run again). Stop the old site first
 * so nothing changes under it. The Postgres schema is created (migrated) by this script before copying.
 */
import "dotenv/config";
import { createClient } from "@libsql/client";
import { getTableColumns, getTableName, sql } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { db, migrateOnly, schema } from "../src/lib/db";
import { seedSuperadmin } from "../src/lib/db/seed-admin";

const file = process.argv[2];
if (!file) { console.error("usage: npm run db:copy -- <path to the SQLite file>"); process.exit(2); }
const sqlite = createClient({ url: file.startsWith("file:") ? file : `file:${file}` });
// parents before children where the data has references (no foreign keys are declared, so the order only matters for sense)
const ORDER = ["users", "sessions", "loginTokens", "booths", "transactions", "events", "boothDaily", "boothReferrers", "visitorSeen", "siteDaily", "messages", "seasons", "billboards", "notifications", "settings", "coinLedger", "gameScores", "gamePlays", "mailMessages", "mailAttachments", "emailTemplates", "emailTemplateVersions", "webhookEvents", "adminAuditLog", "boothArt", "payouts", "perfSessions", "theaterVideos", "friendships", "teams", "teamMembers", "dms", "sentinelErrors", "boothCodes", "codeRedemptions", "questDays", "boothProducts", "userItems", "sponsoredItems", "favorites", "blocks", "reports"] as const;

async function main() {
  await migrateOnly(); // tables only: the superadmin seed runs after the copy, so it promotes the account the old data brings instead of taking its email first
  const tables = Object.entries(schema).filter(([, v]) => v instanceof PgTable);
  const byKey = new Map(tables.map(([k, v]) => [k, v as (typeof schema)[keyof typeof schema]]));
  const keys = [...ORDER.filter((k) => byKey.has(k)), ...tables.map(([k]) => k).filter((k) => !(ORDER as readonly string[]).includes(k))];
  let grand = 0;
  for (const key of keys) {
    const table = byKey.get(key)!;
    const name = getTableName(table as never);
    const cols = getTableColumns(table as never) as Record<string, { name: string; dataType: string; columnType: string }>;
    let rows: Record<string, unknown>[];
    try { rows = (await sqlite.execute(`select * from "${name}"`)).rows as Record<string, unknown>[]; }
    catch { console.log(`${name}: not in the SQLite file, skipped`); continue; }
    if (!rows.length) { console.log(`${name}: empty`); continue; }
    const mapped = rows.map((r) => {
      const out: Record<string, unknown> = {};
      for (const [prop, c] of Object.entries(cols)) {
        let v = r[c.name];
        if (v === undefined) continue;
        if (c.dataType === "boolean") v = v === null ? null : v === 1 || v === true || v === "1";
        else if (c.dataType === "number" && typeof v === "bigint") v = Number(v);
        else if (c.columnType === "PgCustomColumn" && v && !(v instanceof Buffer)) v = Buffer.from(v as ArrayBuffer);
        out[prop] = v;
      }
      return out;
    });
    let done = 0;
    for (let i = 0; i < mapped.length; i += 200) {
      const chunk = mapped.slice(i, i + 200);
      await db.insert(table as never).values(chunk as never).onConflictDoNothing();
      done += chunk.length;
    }
    const res = (await db.execute(sql.raw(`select count(*)::int as n from "${name}"`))) as unknown as { rows: Array<{ n: number }> };
    const n = res.rows?.[0]?.n ?? "?";
    console.log(`${name}: ${done} rows copied (${n} now in Postgres)`);
    grand += done;
  }
  await seedSuperadmin(db);
  console.log(`done: ${grand} rows`);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
