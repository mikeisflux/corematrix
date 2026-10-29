import { NextResponse } from "next/server";
import { checkBoothCode } from "@/lib/economy";
import { currentUser } from "@/lib/auth";
import { BOOTH_SIZES } from "@/lib/config";
export const dynamic = "force-dynamic";

/** GET ?code=FCC-XXXX-XXXX&booth=442 → whether this code pays for that booth right now. */
export async function GET(req: Request) {
  const u = await currentUser();
  if (!u) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  const url = new URL(req.url);
  const code = url.searchParams.get("code") ?? "", booth = Number(url.searchParams.get("booth"));
  try {
    const c = await checkBoothCode(code, booth);
    return NextResponse.json({ ok: true, size: c.size, label: c.label, covers: c.size === "any" ? "any booth" : BOOTH_SIZES[c.size as keyof typeof BOOTH_SIZES]?.name ?? c.size });
  } catch (e) { return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 }); }
}
