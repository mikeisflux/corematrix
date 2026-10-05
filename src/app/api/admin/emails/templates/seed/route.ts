import { NextResponse } from "next/server";
import { audit } from "@/lib/auth";
import { seedTemplates } from "@/lib/template-seed";
import { DEFAULT_TEMPLATES } from "@/lib/email-templates";
import { guard } from "../../../_lib";

export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  const g = await guard(); if (g instanceof NextResponse) return g;
  const force = new URL(req.url).searchParams.get("force") === "1";
  const r = await seedTemplates(force, g.email);
  await audit(g.id, "template.seed", "email_template", null, undefined, { ...r, force }, g.email);
  return NextResponse.json({ ...r, total: DEFAULT_TEMPLATES.length });
}
