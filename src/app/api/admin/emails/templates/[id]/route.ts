import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { audit } from "@/lib/auth";
import { renderTemplate, sendMail, htmlToText } from "@/lib/sendgrid";
import { getSettings } from "@/lib/settings";
import { newId, now } from "@/lib/util";
import { guard, bad, notFound, readJson, str, optStr, bool } from "../../../_lib";
import { SAMPLE_VARS } from "@/lib/email-templates";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
const T = schema.emailTemplates, V = schema.emailTemplateVersions;

export async function GET(_req: Request, ctx: Ctx) {
  const g = await guard(); if (g instanceof NextResponse) return g;
  const { id } = await ctx.params;
  const [row] = await db.select().from(T).where(eq(T.id, id));
  if (!row) return notFound();
  const versions = await db.select({ id: V.id, version: V.version, subject: V.subject, changedBy: V.changedBy, changeNote: V.changeNote, createdAt: V.createdAt }).from(V).where(eq(V.templateId, id)).orderBy(desc(V.version));
  return NextResponse.json({ row: { ...row, versions } });
}
export async function PUT(req: Request, ctx: Ctx) {
  const g = await guard(); if (g instanceof NextResponse) return g;
  const { id } = await ctx.params;
  const [before] = await db.select().from(T).where(eq(T.id, id));
  if (!before) return notFound();
  const b = await readJson(req);
  const subject = str(b.subject, 300).trim() || before.subject;
  const html = str(b.html, 200_000) || before.html;
  const text = b.text === undefined ? before.text : optStr(b.text, 50_000);
  const contentChanged = subject !== before.subject || html !== before.html || text !== before.text;
  if (contentChanged) await db.insert(V).values({ id: newId(), templateId: id, version: before.version, subject: before.subject, html: before.html, text: before.text, changedBy: g.email, changeNote: optStr(b.changeNote, 300), createdAt: now() });
  const [row] = await db.update(T).set({ name: str(b.name, 120).trim() || before.name, description: b.description === undefined ? before.description : optStr(b.description, 500), subject, html, text, isActive: b.isActive === undefined ? before.isActive : bool(b.isActive), version: contentChanged ? before.version + 1 : before.version, updatedAt: now() }).where(eq(T.id, id)).returning();
  await audit(g.id, "template.update", "email_template", id, { version: before.version }, { version: row.version }, g.email);
  return NextResponse.json({ row });
}
/* actions: preview, test, restore {versionId}, version {versionId} */
export async function POST(req: Request, ctx: Ctx) {
  const g = await guard(); if (g instanceof NextResponse) return g;
  const { id } = await ctx.params;
  const [t] = await db.select().from(T).where(eq(T.id, id));
  if (!t) return notFound();
  const b = await readJson<{ action?: string; vars?: Record<string, unknown>; versionId?: string; subject?: string; html?: string; text?: string }>(req);
  const s = await getSettings(["SITE_NAME", "SITE_URL", "SUPPORT_EMAIL"]);
  const vars = { ...SAMPLE_VARS, siteName: s.SITE_NAME || "AlwaysOnCon", siteUrl: s.SITE_URL || "http://localhost:3000", supportEmail: s.SUPPORT_EMAIL || "hello@alwaysoncon.app", ...(b.vars || {}) };
  const subjectSrc = b.subject ?? t.subject, htmlSrc = b.html ?? t.html, textSrc = b.text ?? t.text;
  switch (b.action) {
    case "preview":
      return NextResponse.json({ subject: renderTemplate(subjectSrc, vars), html: renderTemplate(htmlSrc, vars), text: textSrc ? renderTemplate(textSrc, vars) : htmlToText(renderTemplate(htmlSrc, vars)) });
    case "test": {
      const html = renderTemplate(htmlSrc, vars);
      const r = await sendMail({ to: g.email, subject: `[TEST] ${renderTemplate(subjectSrc, vars)}`, text: textSrc ? renderTemplate(textSrc, vars) : htmlToText(html), html, templateSlug: t.slug, channel: "system" });
      if (!r.ok) return bad(r.error || "Send failed", 502);
      await audit(g.id, "template.test", "email_template", id, undefined, { to: g.email }, g.email);
      return NextResponse.json({ ok: true });
    }
    case "restore": {
      const [v] = await db.select().from(V).where(eq(V.id, str(b.versionId, 40)));
      if (!v || v.templateId !== id) return bad("Version not found");
      await db.insert(V).values({ id: newId(), templateId: id, version: t.version, subject: t.subject, html: t.html, text: t.text, changedBy: g.email, changeNote: `before restore of v${v.version}`, createdAt: now() });
      const [row] = await db.update(T).set({ subject: v.subject, html: v.html, text: v.text, version: t.version + 1, updatedAt: now() }).where(eq(T.id, id)).returning();
      await audit(g.id, "template.restore", "email_template", id, { version: t.version }, { version: row.version, from: v.version }, g.email);
      return NextResponse.json({ row });
    }
    case "version": {
      const [v] = await db.select().from(V).where(eq(V.id, str(b.versionId, 40)));
      if (!v || v.templateId !== id) return bad("Version not found");
      return NextResponse.json({ version: v });
    }
    default: return bad("Unknown action");
  }
}
export async function DELETE(_req: Request, ctx: Ctx) {
  const g = await guard(); if (g instanceof NextResponse) return g;
  const { id } = await ctx.params;
  const [t] = await db.select().from(T).where(eq(T.id, id));
  if (!t) return notFound();
  await db.delete(V).where(eq(V.templateId, id));
  await db.delete(T).where(eq(T.id, id));
  await audit(g.id, "template.delete", "email_template", id, { slug: t.slug }, undefined, g.email);
  return NextResponse.json({ ok: true });
}
