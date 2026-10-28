import { NextResponse } from "next/server";
import { listPerf, exportPerf } from "@/lib/perf";
import { guard, pageParams } from "../_lib";
export const dynamic = "force-dynamic";
/** Session list; ?format=json streams every session with samples as a download. */
export async function GET(req: Request) {
  const g = await guard("performance"); if (g instanceof NextResponse) return g;
  const url = new URL(req.url);
  if (url.searchParams.get("format") === "json") {
    const body = JSON.stringify({ kind: "forevercomiccon-perf-export", exportedAt: new Date().toISOString(), sessions: await exportPerf() }, null, 1);
    return new NextResponse(body, { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="fcc-performance-${new Date().toISOString().slice(0, 10)}.json"` } });
  }
  const { page, size } = pageParams(url, 40);
  return NextResponse.json(await listPerf(page, size));
}
