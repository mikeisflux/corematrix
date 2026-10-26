import { NextResponse } from "next/server";
import { getPerf, perfReport } from "@/lib/perf";
import { guard } from "../../_lib";
export const dynamic = "force-dynamic";
/** One session; ?format=text returns the pasteable report. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await guard(); if (g instanceof NextResponse) return g;
  const { id } = await ctx.params;
  const s = await getPerf(id);
  if (!s) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (new URL(req.url).searchParams.get("format") === "text") return new NextResponse(perfReport(s), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
  return NextResponse.json({ session: s, report: perfReport(s) });
}
