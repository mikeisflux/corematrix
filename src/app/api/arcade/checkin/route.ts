import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { dailyCheckIn } from "@/lib/arcade";

export async function POST() {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "Sign in" }, { status: 401 });
  return NextResponse.json(await dailyCheckIn(u.id));
}
