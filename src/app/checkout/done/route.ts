import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/lib/db";
import { SITE_URL } from "@/lib/config";

/** DivinityCoin return URL lands here; we route the buyer to the right place. */
export async function GET(req: Request) {
  await ensureMigrated();
  const txId = new URL(req.url).searchParams.get("tx") ?? "";
  const [tx] = await db.select().from(schema.transactions).where(eq(schema.transactions.id, txId)).limit(1);
  if (!tx) return NextResponse.redirect(`${SITE_URL}/`);
  if (tx.kind === "coins") return NextResponse.redirect(`${SITE_URL}/arcade?paid=1`);
  if (tx.kind === "billboard") return NextResponse.redirect(`${SITE_URL}/dashboard?billboard=1`);
  const welcome = tx.kind === "claim" || tx.kind === "takeover" ? "&welcome=1" : "";
  return NextResponse.redirect(`${SITE_URL}/booth/${tx.boothId}?paid=${tx.kind}${welcome}`);
}
