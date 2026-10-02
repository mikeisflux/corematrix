import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { newId } from "@/lib/util";

export const VID_COOKIE = "tl_vid";

/** Reads the visitor cookie; if missing, generates one and attaches it to `res`. */
export async function getOrSetVisitor(res?: NextResponse): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(VID_COOKIE)?.value;
  if (existing) return existing;
  const id = `v_${newId()}`;
  res?.cookies.set(VID_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 365 * 86400 });
  return id;
}
