import { defineConfig } from "drizzle-kit";

// Migrations are generated for Postgres (`npm run db:generate`) and applied by the app on boot (or `npm run db:migrate`).
export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://localhost:5432/forevercomiccon" },
});
