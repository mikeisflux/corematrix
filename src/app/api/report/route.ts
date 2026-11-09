import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { addReport } from "@/lib/safety";
import { REPORT_REASONS } from "@/lib/report-reasons";
import { allow } from "@/lib/throttle";

export const dynamic = "force-dynamic";

/** Report a person to the admins. Rate limited: ten an hour per account. */
export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "Sign in to report someone" }, { status: 401 });
  if (!allow(`report:${u.id}`, 10, 3600_000)) return NextResponse.json({ error: "That's a lot of reports. Try again later." }, { status: 429 });
  const b = z.object({ uid: z.string().max(40).optional().nullable(), pid: z.string().max(60).optional().nullable(), name: z.string().max(40).optional(), reason: z.enum(REPORT_REASONS), details: z.string().max(600).optional(), context: z.string().max(2000).optional() }).safeParse(await req.json().catch(() => null));
  if (!b.success) return NextResponse.json({ error: "Pick a reason" }, { status: 400 });
  try { return NextResponse.json({ ok: true, id: await addReport(u.id, b.data) }); }
  catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
