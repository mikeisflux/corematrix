import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { getBooth, liveBooth } from "@/lib/economy";
import { isArtSlot, setArt, artFlagsFor, artLinksFor, setArtLink } from "@/lib/art";
import { normalizeUrl } from "@/lib/util";
import { publish } from "@/lib/realtime";
import { bookCapacity, BOOK_PRICE_CENTS } from "@/lib/config";

export const dynamic = "force-dynamic";
const Body = z.object({ slot: z.string(), url: z.string().max(6_000_000).nullable().optional(), link: z.string().max(500).nullable().optional() });

/** Save (or clear) a banner slot. `url` is the data URL that /api/art/upload returned. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const { id } = await ctx.params;
  const boothId = Number(id);
  const p = await getBooth(boothId);
  if (!p || p.ownerId !== u.id) return NextResponse.json({ error: "Not your booth" }, { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !isArtSlot(parsed.data.slot)) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const { slot, url, link } = parsed.data;
  // a buy link for a cover, on its own
  if (url === undefined) {
    if (link === undefined || !slot.startsWith("book:")) return NextResponse.json({ error: "Bad request" }, { status: 400 });
    const clean = link ? normalizeUrl(link) : null;
    if (link && !clean) return NextResponse.json({ error: "Enter a full link, starting with https://" }, { status: 400 });
    await setArtLink(boothId, slot, clean ?? null);
    const [art, artLinks] = await Promise.all([artFlagsFor(boothId), artLinksFor(boothId)]);
    publish({ type: "booth", booth: { ...liveBooth(p), art, artLinks } });
    return NextResponse.json({ ok: true, art, artLinks });
  }
  if (slot.startsWith("book:")) {
    const n = Number(slot.slice(5));
    if (!(n < Math.min(p.bookSlots, bookCapacity(p.size, p.kind)))) return NextResponse.json({ error: `Platform ${n + 1} isn't unlocked yet. Display a book for ${BOOK_PRICE_CENTS / 100} dollars first.` }, { status: 400 });
  }
  if (url === null) await setArt(boothId, slot, null);
  else {
    const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(url);
    if (!m) return NextResponse.json({ error: "Upload the file first" }, { status: 400 });
    // re-normalise server side so the stored art is always exactly the slot size
    const { normalizeArt } = await import("@/lib/art");
    await setArt(boothId, slot, await normalizeArt(Buffer.from(m[2], "base64"), slot));
  }
  const [art, artLinks] = await Promise.all([artFlagsFor(boothId), artLinksFor(boothId)]);
  publish({ type: "booth", booth: { ...liveBooth(p), art, artLinks } });
  return NextResponse.json({ ok: true, art, artLinks });
}
