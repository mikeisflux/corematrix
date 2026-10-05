import { eq } from "drizzle-orm";
import { db, ensureMigrated, schema } from "@/lib/db";
import { htmlToText } from "@/lib/sendgrid";
import { newId, now } from "@/lib/util";
import { DEFAULT_TEMPLATES } from "@/lib/email-templates";

/** Create any missing default templates; with `force`, reset existing ones (keeping a version). */
export async function seedTemplates(force: boolean, by: string | null): Promise<{ created: number; updated: number }> {
  await ensureMigrated();
  let created = 0, updated = 0;
  for (const t of DEFAULT_TEMPLATES) {
    const [existing] = await db.select().from(schema.emailTemplates).where(eq(schema.emailTemplates.slug, t.slug));
    if (!existing) {
      await db.insert(schema.emailTemplates).values({ id: newId(), slug: t.slug, name: t.name, description: t.description, subject: t.subject, html: t.html, text: t.text ?? htmlToText(t.html), createdAt: now(), updatedAt: now() });
      created++;
    } else if (force) {
      await db.insert(schema.emailTemplateVersions).values({ id: newId(), templateId: existing.id, version: existing.version, subject: existing.subject, html: existing.html, text: existing.text, changedBy: by, changeNote: "before reset to default", createdAt: now() });
      await db.update(schema.emailTemplates).set({ subject: t.subject, html: t.html, text: t.text ?? htmlToText(t.html), version: existing.version + 1, updatedAt: now() }).where(eq(schema.emailTemplates.id, existing.id));
      updated++;
    }
  }
  return { created, updated };
}

const g = globalThis as unknown as { __fccTemplatesSeeded?: Promise<void> };
/** Once per process: make sure the default templates exist (cheap no-op afterwards). */
export function ensureDefaultTemplates(): Promise<void> {
  if (!g.__fccTemplatesSeeded) g.__fccTemplatesSeeded = seedTemplates(false, null).then(() => undefined).catch((e) => { g.__fccTemplatesSeeded = undefined; console.error("[templates] seed failed", e); });
  return g.__fccTemplatesSeeded;
}
