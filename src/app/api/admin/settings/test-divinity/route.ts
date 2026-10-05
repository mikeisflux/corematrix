import { NextResponse } from "next/server";
import { divinitycoin, divinityWebhookUrl } from "@/lib/divinitycoin";
import { guard } from "../../_lib";
export const dynamic = "force-dynamic";
export async function POST() {
  const g = await guard(); if (g instanceof NextResponse) return g;
  const health = await divinitycoin.healthCheck();
  return NextResponse.json({ ...health, webhookUrl: await divinityWebhookUrl() });
}
