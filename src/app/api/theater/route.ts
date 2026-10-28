import { NextResponse } from "next/server";
import { playlist } from "@/lib/theater";
import { resumeEncodes } from "@/lib/theater-encode";
export const dynamic = "force-dynamic";
/** What the arcade theater is showing (Admin → Theater): items in order with durations, the caption and the server clock. */
export async function GET() {
  void resumeEncodes();
  return NextResponse.json(await playlist(), { headers: { "Cache-Control": "public, max-age=30" } });
}
