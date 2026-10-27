import { NextResponse } from "next/server";
import { playlist } from "@/lib/theater";
export const dynamic = "force-dynamic";
/** What the arcade theater is showing (Admin → Theater): items in order with durations, the caption and the server clock. */
export async function GET() {
  return NextResponse.json(await playlist(), { headers: { "Cache-Control": "public, max-age=30" } });
}
