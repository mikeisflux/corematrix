import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { buyItem, ownedItems } from "@/lib/shop";

const Body = z.object({ itemId: z.string().max(60) });

export async function POST(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  try {
    const r = await buyItem(u.id, parsed.data.itemId);
    return NextResponse.json({ item: r.item, coins: r.coins, owned: Array.from(await ownedItems(u.id)) });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 400 }); }
}
