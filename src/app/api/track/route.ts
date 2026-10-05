import { NextResponse } from "next/server";
import { z } from "zod";
import { trackImpressions, trackBooth } from "@/lib/analytics";
import { trackBillboard } from "@/lib/economy";
import { getOrSetVisitor } from "@/lib/visitor";
import { ensureMigrated } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { exploreReward } from "@/lib/arcade";
import { takeoverNudge } from "@/lib/nudges";

const Body = z.union([
  z.object({ kind: z.literal("impressions"), boothIds: z.array(z.number().int().positive()).max(500) }),
  z.object({ kind: z.enum(["hovers", "views", "clicks"]), boothId: z.number().int().positive(), source: z.string().max(40).optional() }),
  z.object({ kind: z.literal("billboard"), id: z.string().max(40), metric: z.enum(["seen", "opens", "clicks"]) }),
  z.object({ kind: z.literal("takeover_view"), boothId: z.number().int().positive() }),
]);

export async function POST(req: Request) {
  await ensureMigrated();
  const res = NextResponse.json({ ok: true });
  const visitor = await getOrSetVisitor(res);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });
  const b = parsed.data;
  if (b.kind === "impressions") await trackImpressions(b.boothIds, visitor);
  else if (b.kind === "takeover_view") {
    const u = await currentUser();
    await takeoverNudge(b.boothId, u?.id ?? null);
  } else if (b.kind === "billboard") await trackBillboard(b.id, b.metric);
  else {
    await trackBooth(b.boothId, b.kind, visitor, b.source ?? "map");
    if (b.kind === "views") {
      const u = await currentUser();
      if (u) {
        const coins = await exploreReward(u.id, b.boothId);
        if (coins) return NextResponse.json({ ok: true, coins }, { headers: res.headers });
      }
    }
  }
  return res;
}
