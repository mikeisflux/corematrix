import { timingSafeEqual } from "node:crypto";

/** Cron routes accept `?secret=` or `Authorization: Bearer` matching CRON_SECRET. Open in dev if unset. */
export async function cronAuthorized(req: Request): Promise<boolean> {
  const { getSetting } = await import("@/lib/settings");
  const secret = (await getSetting("CRON_SECRET")) || process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  const url = new URL(req.url);
  const given = url.searchParams.get("secret") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (given.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(secret));
}
