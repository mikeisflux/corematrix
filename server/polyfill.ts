// Two things `next start` does before loading anything, which our own server must do too:
// 1. read the env files (.env.local, .env.production, .env …) so DATABASE_URL, REDIS_URL and friends exist before the
//    modules below open their connections. Without this the database module, imported before Next had a chance to
//    load them, saw no DATABASE_URL and opened the embedded fallback database; the app then kept that wrong connection.
// 2. put AsyncLocalStorage on the global for Next's request helpers (next/headers and friends).
import { loadEnvConfig } from "@next/env";
import { AsyncLocalStorage } from "node:async_hooks";
loadEnvConfig(process.cwd(), false);
(globalThis as unknown as { AsyncLocalStorage?: unknown }).AsyncLocalStorage ??= AsyncLocalStorage;
