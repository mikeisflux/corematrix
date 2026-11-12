import { NextResponse } from "next/server";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { getBooth, liveBooth } from "@/lib/economy";
import { canManageBooth } from "@/lib/booth-access";
import { isArtSlot, setArt, artFlagsFor, artLinksFor, artAdultFor, setArtLink } from "@/lib/art";
import { adultAllowed, looksNude, NUDITY_REFUSED } from "@/lib/nudity";
import { normalizeUrl } from "@/lib/util";
import { publish } from "@/lib/realtime";
import { bookCapacity, BOOK_PRICE_CENTS } from "@/lib/config";

export const dynamic = "force-dynamic";
const Body = z.object({ slot: z.string(), url: z.string().max(6_000_000).nullable().optional(), link: z.string().max(500).nullable().optional(), adult: z.boolean().optional() });

/** Save (or clear) a banner slot. `url` is the data URL that /api/art/upload returned. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const { id } = await ctx.params;
  const boothId = Number(id);
  const p = await getBooth(boothId);
  if (!p || !(await canManageBooth(u.id, p))) return NextResponse.json({ error: "Not your booth" }, { status: 403 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !isArtSlot(parsed.data.slot)) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  const { slot, url, link, adult } = parsed.data;
  // a buy link for a cover (or a print link for a portfolio piece), on its own
  if (url === undefined) {
    if (link === undefined || !(slot.startsWith("book:") || slot.startsWith("gallery:"))) return NextResponse.json({ error: "Bad request" }, { status: 400 });
    const clean = link ? normalizeUrl(link) : null;
    if (link && !clean) return NextResponse.json({ error: "Enter a full link, starting with https://" }, { status: 400 });
    await setArtLink(boothId, slot, clean ?? null);
    const [art, artLinks, artAdult] = await Promise.all([artFlagsFor(boothId), artLinksFor(boothId), artAdultFor(boothId)]);
    publish({ type: "booth", booth: { ...liveBooth(p), art, artLinks, artAdult } });
    return NextResponse.json({ ok: true, art, artLinks, artAdult });
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
    const buf = Buffer.from(m[2], "base64");
    // the hall is 13 and up: an explicit image is refused, except a piece its owner marks 18+ (shown blurred behind an age check)
    const mayBeAdult = adultAllowed(slot);
    if (!(adult && mayBeAdult) && (await looksNude(buf))) {
      return NextResponse.json(mayBeAdult
        ? { error: "That image looks like it shows nudity or sexual content. Mark it as adult content (18+) to upload it: visitors see it blurred until they confirm they are 18 or older.", code: "nudity", canAdult: true }
        : { error: `${NUDITY_REFUSED} Banners, signs and logos are seen by everyone on the floor, so they can't be marked 18+.`, code: "nudity", canAdult: false }, { status: 422 });
    }
    await setArt(boothId, slot, await normalizeArt(buf, slot), !!adult && mayBeAdult);
  }
  const [art, artLinks, artAdult] = await Promise.all([artFlagsFor(boothId), artLinksFor(boothId), artAdultFor(boothId)]);
  publish({ type: "booth", booth: { ...liveBooth(p), art, artLinks, artAdult } });
  return NextResponse.json({ ok: true, art, artLinks, artAdult });
}
