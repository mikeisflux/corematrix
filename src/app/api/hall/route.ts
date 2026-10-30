import { NextResponse } from "next/server";
import { hallSnapshot } from "@/lib/hall-snapshot";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await hallSnapshot(), { headers: { "Cache-Control": "no-store" } });
}
