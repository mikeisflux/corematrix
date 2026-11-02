import { NextResponse } from "next/server";
import { audit } from "@/lib/auth";
import { guard, bad, readJson } from "../../_lib";
import { activeSponsors, addSponsor, endSponsor } from "@/lib/shop";
import { ITEMS, isItemId } from "@/lib/hall/items";

export const dynamic = "force-dynamic";

/** Sponsored items: which booths give away what, for how long. ?booth=<id> narrows the list. */
export async function GET(req: Request) {
  const g = await guard("booths"); if (g instanceof NextResponse) return g;
  const booth = Number(new URL(req.url).searchParams.get("booth") ?? "");
  const sponsors = (await activeSponsors()).filter((s) => !booth || s.boothId === booth);
  return NextResponse.json({ sponsors, items: ITEMS });
}

/* POST { boothId, itemId, days } adds one; { action: "end", id } ends one early. */
export async function POST(req: Request) {
  const g = await guard("booths"); if (g instanceof NextResponse) return g;
  const b = await readJson(req);
  if (b.action === "end") {
    const id = String(b.id ?? "");
    if (!/^[a-z0-9]{1,24}$/.test(id)) return bad("Bad id");
    await endSponsor(id);
    await audit(g.id, "shop.sponsor.end", "sponsored_item", id, null, null, g.email);
    return NextResponse.json({ ok: true });
  }
  const boothId = Number(b.boothId), days = Number(b.days ?? 7);
  if (!Number.isInteger(boothId) || boothId < 1) return bad("Pick a booth");
  if (!isItemId(b.itemId)) return bad("Pick an item");
  if (!Number.isFinite(days) || days < 1 || days > 90) return bad("Days: 1 to 90");
  try {
    const s = await addSponsor(b.itemId, boothId, Math.round(days), g.id);
    await audit(g.id, "shop.sponsor.add", "sponsored_item", s.id, null, { boothId, itemId: b.itemId, days }, g.email);
    return NextResponse.json({ sponsor: s });
  } catch (e) { return bad((e as Error).message); }
}
