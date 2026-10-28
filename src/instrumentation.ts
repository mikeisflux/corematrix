/** Next.js server hook: every error thrown by a route or page on the server lands in Sentinel (Admin → Sentinel). */
export async function onRequestError(err: unknown, request: { path: string; method: string; headers: Record<string, string | string[] | undefined> }, context: { routeType: string; routePath: string }) {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { recordError } = await import("@/lib/sentinel");
    const e = err instanceof Error ? err : new Error(String(err));
    const ua = request.headers["user-agent"]; const cookie = String(request.headers.cookie ?? "");
    const vid = /(?:^|;\s*)fcc_vid=([^;]+)/.exec(cookie)?.[1] ?? null;
    await recordError({ kind: "server", where: `${request.method} ${context.routePath || request.path}`.slice(0, 60), message: e.message, stack: e.stack ?? null, url: request.path, ua: Array.isArray(ua) ? ua[0] : ua ?? null, visitorId: vid });
  } catch (x) { console.error("[sentinel] could not record a server error", x); }
}
