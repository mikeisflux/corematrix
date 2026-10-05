import { NextResponse } from "next/server";
import { currentUser } from "@/lib/auth";
import { rideFlyover } from "@/lib/arcade";

export async function POST() {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "Sign in to ride. New riders get free coins." }, { status: 401 });
  try {
    return NextResponse.json({ coins: await rideFlyover(u.id) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
