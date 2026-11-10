// Next's request helpers (next/headers and friends) expect AsyncLocalStorage on the global, which `next start` sets
// up before loading anything. Our server imports src/lib modules that pull those helpers in, so set it first.
import { AsyncLocalStorage } from "node:async_hooks";
(globalThis as unknown as { AsyncLocalStorage?: unknown }).AsyncLocalStorage ??= AsyncLocalStorage;
