/**
 * A 206 that is really the whole file.
 *
 * Some browsers' download managers and security extensions add a Range header to large downloads (models, HDRIs). The
 * server then answers 206 Partial Content with the full body, and three's FileLoader, which only accepts 200, refuses
 * it: "Could not load /models/cabinet.glb: responded with 206". The hall then has no models for that visitor.
 *
 * This wraps window.fetch once: a 206 that nobody asked for (no Range header on the request) whose Content-Range says
 * "bytes 0-(N-1)/N" is handed back as a 200 with the same body. A genuinely partial response is left alone.
 */
let installed = false;
export function installFullBodyFetch(): void {
  if (installed || typeof window === "undefined" || typeof window.fetch !== "function") return;
  installed = true;
  const orig = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const res = await orig(input, init);
    if (res.status !== 206) return res;
    const asked = (init?.headers && new Headers(init.headers).get("range")) || (input instanceof Request && input.headers.get("range"));
    if (asked) return res;
    const m = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(res.headers.get("content-range") ?? "");
    if (!m || m[1] !== "0" || Number(m[2]) + 1 !== Number(m[3])) return res;
    const headers = new Headers(res.headers);
    headers.delete("content-range");
    // the body stream is already decoded; keep a length only when it is the plain byte count (loaders use it for progress)
    if (headers.get("content-encoding")) { headers.delete("content-encoding"); headers.delete("content-length"); } else headers.set("content-length", m[3]);
    return new Response(res.body, { status: 200, statusText: "OK", headers });
  };
}
