import { NextResponse } from "next/server";
import { signOut } from "@/lib/auth";
import { SITE_URL } from "@/lib/config";

export async function POST() {
  await signOut();
  return NextResponse.redirect(`${SITE_URL}/`, { status: 303 });
}
