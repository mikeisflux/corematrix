/**
 * Create or promote an admin with a password, from the server shell:
 *   npx tsx scripts/create-admin.ts you@example.com 'a long password'
 *   ADMIN_PASSWORD='a long password' npx tsx scripts/create-admin.ts you@example.com   (keeps it out of shell history)
 * Idempotent: an existing user is promoted and gets the new password.
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { db, ensureMigrated, schema } from "../src/lib/db";
import { findOrCreateUser, setPassword } from "../src/lib/auth";

const [email, pwArg] = process.argv.slice(2);
const password = process.env.ADMIN_PASSWORD || pwArg;
if (!email || !password) { console.error("usage: npx tsx scripts/create-admin.ts <email> [password]   (or ADMIN_PASSWORD=…)"); process.exit(2); }

async function main() {
  await ensureMigrated();
  const user = await findOrCreateUser(email.trim().toLowerCase());
  await db.update(schema.users).set({ isAdmin: true }).where(eq(schema.users.id, user.id));
  await setPassword(user.id, password);
  console.log(`admin ready: ${user.email} (${user.id}). Sign in at /app/login with the password.`);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e.message || e); process.exit(1); });
