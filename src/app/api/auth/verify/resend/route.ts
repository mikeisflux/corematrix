import { NextResponse } from "next/server";
import { currentUser, sendVerification } from "@/lib/auth";

/** Email the signed-in account a fresh confirm link (one every 2 minutes). */
export async function POST() {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  try {
    const r = await sendVerification(u.id);
    if (r === "wait") return NextResponse.json({ error: "We just sent one. Check your inbox and spam folder, or try again in two minutes." }, { status: 429 });
    return NextResponse.json({ ok: true, status: r, email: u.email });
  } catch (e) { return NextResponse.json({ error: (e as Error).message }, { status: 500 }); }
}
