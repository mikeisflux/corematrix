/**
 * One Redis connection per process (plus one for subscriptions), made only when REDIS_URL is set. With it, several
 * pm2 workers share the live bus and the floor roster; without it everything stays in this process, as before.
 */
import Redis from "ioredis";

const g = globalThis as unknown as { __fccRedis?: Redis | null; __fccRedisSub?: Redis | null; __fccWorkerId?: string; __fccRedisWarned?: boolean };
export const WORKER_ID = (g.__fccWorkerId ??= `${process.pid}-${Math.random().toString(36).slice(2, 8)}`);
export const redisUrl = () => process.env.REDIS_URL?.trim() || "";
export const redisEnabled = () => !!redisUrl();

function make(): Redis | null {
  const url = redisUrl(); if (!url) return null;
  const r = new Redis(url, { lazyConnect: false, maxRetriesPerRequest: 2, enableOfflineQueue: true, connectTimeout: 5000, retryStrategy: (n) => Math.min(30_000, 500 * 2 ** Math.min(n, 6)) });
  r.on("error", (e) => { if (!g.__fccRedisWarned) { g.__fccRedisWarned = true; console.error("[redis]", (e as Error).message); } });
  return r;
}
export function redis(): Redis | null { if (g.__fccRedis === undefined) g.__fccRedis = make(); return g.__fccRedis; }
export function redisSub(): Redis | null { if (g.__fccRedisSub === undefined) g.__fccRedisSub = make(); return g.__fccRedisSub; }
