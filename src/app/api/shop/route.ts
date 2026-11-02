import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { ITEMS } from "@/lib/hall/items";
import { ownedItems, activeSponsors } from "@/lib/shop";

export const dynamic = "force-dynamic";

/** The catalogue, what the player owns, and what booths are giving away right now. */
export async function GET() {
  const u = await currentUser();
  const [owned, sponsors] = await Promise.all([u ? ownedItems(u.id) : new Set<string>(), activeSponsors()]);
  return NextResponse.json({ items: ITEMS, owned: Array.from(owned), sponsors });
}
