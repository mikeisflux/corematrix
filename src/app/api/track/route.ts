import { NextResponse } from "next/server";
import { z } from "zod";
import { trackImpressions, trackBooth } from "@/lib/analytics";
import { trackBillboard } from "@/lib/economy";
import { getOrSetVisitor } from "@/lib/visitor";
import { ensureMigrated } from "@/lib/db";
import { currentUser } from "@/lib/auth";
import { exploreReward } from "@/lib/arcade";
import { takeoverNudge } from "@/lib/nudges";
import { boothSpace } from "@/lib/hall/layout";
import { allow } from "@/lib/throttle";
import { clientIp } from "@/lib/auth";

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
  // a real visitor sends a few of these a minute; a script looping them only gets its first share counted
  // by address as well as visitor: without a cookie every request is a "new" visitor
  if (!allow(`track:${visitor}`, 120, 60_000) || !allow(`trackip:${await clientIp()}`, 240, 60_000)) return res;
  // only booths that exist on the floor get rows
  if ("boothId" in b && !boothSpace(b.boothId)) return res;
  if (b.kind === "impressions") await trackImpressions(b.boothIds.filter((id) => boothSpace(id)), visitor);
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
