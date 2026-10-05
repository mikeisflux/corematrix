import { NextResponse } from "next/server";
import { eq, sql } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/lib/db";
import { audit } from "@/lib/auth";
import { newId, now } from "@/lib/util";
import { guard, bad, readJson, str, optStr, bool } from "../../_lib";
import { SAMPLE_VARS } from "@/lib/email-templates";

export const dynamic = "force-dynamic";
export async function GET() {
  const g = await guard(); if (g instanceof NextResponse) return g;
  await ensureMigrated();
  const rows = await db.select({ id: schema.emailTemplates.id, slug: schema.emailTemplates.slug, name: schema.emailTemplates.name, description: schema.emailTemplates.description, subject: schema.emailTemplates.subject, html: schema.emailTemplates.html, text: schema.emailTemplates.text, isActive: schema.emailTemplates.isActive, version: schema.emailTemplates.version, updatedAt: schema.emailTemplates.updatedAt, versionCount: sql<number>`(select count(*) from email_template_versions v where v.template_id = ${schema.emailTemplates.id})` }).from(schema.emailTemplates).orderBy(schema.emailTemplates.slug);
  return NextResponse.json({ rows, sampleVars: SAMPLE_VARS });
}
export async function POST(req: Request) {
  const g = await guard(); if (g instanceof NextResponse) return g;
  const b = await readJson(req);
  const slug = str(b.slug, 60).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_");
  const name = str(b.name, 120).trim();
  if (!slug || !name) return bad("slug and name are required");
  const [dupe] = await db.select({ id: schema.emailTemplates.id }).from(schema.emailTemplates).where(eq(schema.emailTemplates.slug, slug));
  if (dupe) return bad("slug already exists");
  const id = newId();
  await db.insert(schema.emailTemplates).values({ id, slug, name, description: optStr(b.description, 500), subject: str(b.subject, 300) || name, html: str(b.html, 200_000) || "<p>Hello {{name}},</p>", text: optStr(b.text, 50_000), isActive: b.isActive === undefined ? true : bool(b.isActive), createdAt: now(), updatedAt: now() });
  await audit(g.id, "template.create", "email_template", id, undefined, { slug }, g.email);
  const [row] = await db.select().from(schema.emailTemplates).where(eq(schema.emailTemplates.id, id));
  return NextResponse.json({ row });
}
