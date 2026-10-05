import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { startBillboard, startBoost, startClaim, startCoinPack, startTakeover, startTier, type BuildingDraft } from "@/lib/economy";
import { nextStepUrl } from "@/lib/payments";
import { COIN_RULES } from "@/lib/arcade";

const Draft = z.object({
  name: z.string().max(60),
  tagline: z.string().max(120).optional(),
  description: z.string().max(800).optional(),
  website: z.string().max(300).optional(),
  logoUrl: z.string().max(400_000).optional(),
  color: z.string().max(9).optional(),
  accent: z.string().max(9).optional(),
  style: z.string().max(20).optional(),
  shape: z.string().max(20).optional(),
  roof: z.string().max(20).optional(),
  district: z.string().max(30).optional(),
  floors: z.number().int().min(1).max(500).optional(),
});

const Body = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("claim"), plotId: z.number().int().positive(), draft: Draft, useCredit: z.boolean().optional() }),
  z.object({ kind: z.literal("takeover"), plotId: z.number().int().positive(), draft: Draft, useCredit: z.boolean().optional() }),
  z.object({ kind: z.literal("boost"), plotId: z.number().int().positive(), amountCents: z.number().int().positive() }),
  z.object({ kind: z.literal("tier"), plotId: z.number().int().positive(), tier: z.enum(["pro", "landmark"]) }),
  z.object({ kind: z.literal("coins"), packId: z.string().max(30) }),
  z.object({
    kind: z.literal("billboard"),
    slot: z.enum(["airship", "block"]),
    block: z.number().int().min(0).optional(),
    weeks: z.number().int().min(1).max(8),
    headline: z.string().max(60),
    body: z.string().max(200).optional(),
    website: z.string().max(300).optional(),
    imageUrl: z.string().max(400_000).optional(),
    color: z.string().max(9).optional(),
    plotId: z.number().int().positive().nullable().optional(),
  }),
]);

export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Check the form and try again" }, { status: 400 });
  const b = parsed.data;
  try {
    if (b.kind === "claim") {
      const tx = await startClaim(b.plotId, u.id, b.draft as BuildingDraft, b.useCredit === false ? 0 : u.creditCents);
      return NextResponse.json({ url: await nextStepUrl(tx), txId: tx.id });
    }
    if (b.kind === "takeover") {
      const tx = await startTakeover(b.plotId, u.id, b.draft as BuildingDraft, b.useCredit === false ? 0 : u.creditCents);
      return NextResponse.json({ url: await nextStepUrl(tx), txId: tx.id });
    }
    if (b.kind === "boost") {
      const tx = await startBoost(b.plotId, u.id, b.amountCents);
      return NextResponse.json({ url: await nextStepUrl(tx), txId: tx.id });
    }
    if (b.kind === "tier") {
      const tx = await startTier(b.plotId, u.id, b.tier);
      return NextResponse.json({ url: await nextStepUrl(tx), txId: tx.id });
    }
    if (b.kind === "coins") {
      const tx = await startCoinPack(u.id, b.packId, COIN_RULES.packs);
      return NextResponse.json({ url: await nextStepUrl(tx), txId: tx.id });
    }
    if (b.kind === "billboard") {
      const { tx } = await startBillboard(u.id, b);
      return NextResponse.json({ url: await nextStepUrl(tx), txId: tx.id });
    }
    return NextResponse.json({ error: "Unknown" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
