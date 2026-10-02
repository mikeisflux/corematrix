import { NextResponse } from "next/server";
import { consumeMagicLink } from "@/lib/auth";
import { SITE_URL } from "@/lib/config";
import { dailyCheckIn } from "@/lib/arcade";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  const next = url.searchParams.get("next") ?? "/dashboard";
  const ref = url.searchParams.get("ref") ?? undefined;
  const user = await consumeMagicLink(token, ref);
  if (!user) return NextResponse.redirect(`${SITE_URL}/login?error=expired`);
  await dailyCheckIn(user.id);
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  return NextResponse.redirect(`${SITE_URL}${safeNext}`);
}
