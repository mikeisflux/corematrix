import { setSetting } from "@/lib/settings";
import { NextResponse } from "next/server";
import { audit } from "@/lib/auth";
import { getSetting } from "@/lib/settings";
import { addVideo, listVideos, reorderVideos, videoDir, VIDEO_MAX_BYTES } from "@/lib/theater";
import { encodeState, ffmpegPath, resumeEncodes, TARGET_HEIGHT, TARGET_KBPS } from "@/lib/theater-encode";
import { bad, guard, readJson } from "../_lib";
export const dynamic = "force-dynamic";

/** The whole playlist for the admin page, with where files live and the caption. */
export async function GET() {
  const g = await guard("theater"); if (g instanceof NextResponse) return g;
  await resumeEncodes();
  const [rows, title] = await Promise.all([listVideos(), getSetting("THEATER_TITLE")]);
  return NextResponse.json({ rows, title, dir: videoDir(), maxBytes: VIDEO_MAX_BYTES, encoder: !!ffmpegPath(), target: { height: TARGET_HEIGHT, kbps: TARGET_KBPS }, ...encodeState() });
}
/** Add an external video by URL. */
export async function POST(req: Request) {
  const g = await guard("theater"); if (g instanceof NextResponse) return g;
  const b = await readJson<{ url?: string; title?: string; duration?: number }>(req);
  const url = String(b.url || "").trim();
  if (!/^https?:\/\/.+/.test(url) && !url.startsWith("/")) return bad("Enter a direct video link (https://… .mp4 or .webm)");
  const row = await addVideo({ title: String(b.title || url.split("/").pop() || "Video"), kind: "url", src: url.slice(0, 2000), duration: Number(b.duration) || 0 });
  await audit(g.id, "theater.add", "theater_video", row.id, null, { title: row.title, src: row.src }, g.email);
  return NextResponse.json({ row });
}
/** Reorder: the ids in play order. */
export async function PATCH(req: Request) {
  const g = await guard("theater"); if (g instanceof NextResponse) return g;
  const b = await readJson<{ order?: string[]; title?: string }>(req);
  if (typeof b.title === "string") { await setSetting("THEATER_TITLE", b.title.trim().slice(0, 80)); return NextResponse.json({ ok: true }); }
  if (!Array.isArray(b.order) || b.order.some((x) => typeof x !== "string")) return bad("order must be a list of ids");
  await reorderVideos(b.order.slice(0, 500));
  return NextResponse.json({ ok: true });
}
