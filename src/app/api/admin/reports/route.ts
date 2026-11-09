import { NextResponse } from "next/server";
import { z } from "zod";
import { guard } from "../_lib";
import { listReports, resolveReport } from "@/lib/safety";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const g = await guard("users"); if (g instanceof NextResponse) return g;
  const status = new URL(req.url).searchParams.get("status");
  const rows = await listReports(status === "resolved" || status === "all" ? status : "open");
  return NextResponse.json({ rows, me: g.id });
}

export async function PATCH(req: Request) {
  const g = await guard("users"); if (g instanceof NextResponse) return g;
  const b = z.object({ id: z.string().min(1), reopen: z.boolean().optional() }).safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: "bad body" }, { status: 400 });
  await resolveReport(b.data.id, g.id, !!b.data.reopen);
  return NextResponse.json({ ok: true });
}
