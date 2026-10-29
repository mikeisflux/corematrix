import { NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getSetting, siteName } from "@/lib/settings";
import { sendMail } from "@/lib/sendgrid";
import { audit } from "@/lib/auth";
import { guard } from "../../_lib";
export const dynamic = "force-dynamic";

interface Step { name: string; ok: boolean | null; detail: string }

/** Walks the whole email path and says exactly where it breaks: the stored key, SendGrid's view of it, the from address, a real send. */
export async function POST(req: Request) {
  const g = await guard("settings"); if (g instanceof NextResponse) return g;
  const send = new URL(req.url).searchParams.get("send") !== "0";
  const steps: Step[] = [];
  const key = await getSetting("SENDGRID_API_KEY");
  const [row] = await db.select().from(schema.settings).where(eq(schema.settings.key, "SENDGRID_API_KEY")).limit(1);
  const source = row?.value ? "database (Admin → Settings)" : process.env.SENDGRID_API_KEY ? "server .env" : "nowhere";
  if (!key) steps.push({ name: "API key stored", ok: false, detail: "No SENDGRID_API_KEY in the database or .env. Paste it under Settings → SendGrid and press Save." });
  else {
    const problems: string[] = [];
    if (key !== key.trim()) problems.push("has leading or trailing whitespace");
    if (/[\r\n]/.test(key)) problems.push("contains a line break");
    if (key.startsWith("•")) problems.push("is the masked placeholder, not a real key: reveal the field, paste the key and save again");
    if (!key.startsWith("SG.")) problems.push("does not start with \"SG.\" (SendGrid API keys do)");
    if (key.length < 60) problems.push(`is only ${key.length} characters long (SendGrid keys are about 69)`);
    steps.push({ name: "API key stored", ok: problems.length === 0, detail: `Loaded from ${source}: ${key.length} characters, ends in …${key.slice(-4)}${problems.length ? ". It " + problems.join("; ") : ""}` });
  }
  const from = (await getSetting("MAIL_FROM")) || "no-reply@forevercomiccon.com";
  steps.push({ name: "From address", ok: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(from), detail: `${from}${(await getSetting("MAIL_FROM")) ? "" : " (default; MAIL_FROM is not set)"}` });
  if (key) {
    try {
      const r = await fetch("https://api.sendgrid.com/v3/scopes", { headers: { Authorization: `Bearer ${key.trim()}` } });
      if (r.status === 200) { const j = (await r.json()) as { scopes?: string[] }; const can = (j.scopes ?? []).includes("mail.send"); steps.push({ name: "SendGrid accepts the key", ok: can, detail: can ? `Valid key with ${j.scopes?.length ?? 0} permissions including Mail Send` : "The key is valid but has no Mail Send permission. Make a key with Full Access or Mail Send." }); }
      else steps.push({ name: "SendGrid accepts the key", ok: false, detail: `SendGrid answered ${r.status}: ${(await r.text()).slice(0, 200)}${r.status === 401 ? " — the key is wrong or revoked" : ""}` });
    } catch (e) { steps.push({ name: "SendGrid accepts the key", ok: false, detail: `Could not reach api.sendgrid.com: ${String(e).slice(0, 160)}` }); }
    try {
      const [vs, dom] = await Promise.all([
        fetch("https://api.sendgrid.com/v3/verified_senders", { headers: { Authorization: `Bearer ${key.trim()}` } }),
        fetch("https://api.sendgrid.com/v3/whitelabel/domains", { headers: { Authorization: `Bearer ${key.trim()}` } }),
      ]);
      const senders = vs.status === 200 ? (((await vs.json()) as { results?: Array<{ from_email: string; verified: boolean }> }).results ?? []) : [];
      const domains = dom.status === 200 ? (((await dom.json()) as Array<{ domain: string; valid: boolean }>) ?? []) : [];
      const fromDomain = from.split("@")[1]?.toLowerCase() ?? "";
      const senderOk = senders.some((s) => s.verified && s.from_email.toLowerCase() === from.toLowerCase());
      const domainOk = domains.some((d) => d.valid && (fromDomain === d.domain.toLowerCase() || fromDomain.endsWith("." + d.domain.toLowerCase())));
      steps.push({ name: "From address allowed to send", ok: senderOk || domainOk, detail: senderOk ? `${from} is a verified single sender` : domainOk ? `${fromDomain} is an authenticated domain` : `${from} is neither a verified sender nor on an authenticated domain. Verified senders: ${senders.filter((s) => s.verified).map((s) => s.from_email).join(", ") || "none"}; authenticated domains: ${domains.filter((d) => d.valid).map((d) => d.domain).join(", ") || "none"}. SendGrid rejects mail from anything else (403).` });
    } catch (e) { steps.push({ name: "From address allowed to send", ok: null, detail: `Could not check: ${String(e).slice(0, 160)}` }); }
  }
  const [{ failed }] = await db.select({ failed: sql<number>`count(*)` }).from(schema.mailMessages).where(and(eq(schema.mailMessages.direction, "out"), sql`status IN ('failed','bounced')`, sql`${schema.mailMessages.createdAt} > ${Date.now() - 7 * 86_400_000}`));
  const [last] = await db.select({ status: schema.mailMessages.status, statusMessage: schema.mailMessages.statusMessage, createdAt: schema.mailMessages.createdAt, to: schema.mailMessages.toEmail }).from(schema.mailMessages).where(eq(schema.mailMessages.direction, "out")).orderBy(desc(schema.mailMessages.createdAt)).limit(1);
  steps.push({ name: "Recent sends", ok: Number(failed) === 0 ? true : null, detail: `${Number(failed)} failed in the last 7 days${last ? `. Last: ${last.status} to ${last.to} ${new Date(last.createdAt).toLocaleString()}${last.statusMessage ? ` — ${last.statusMessage.slice(0, 160)}` : ""}` : ""}` });
  let sent: { ok: boolean; to: string; error?: string } | null = null;
  if (send && key) {
    const name = await siteName();
    const r = await sendMail({ to: g.email, subject: `${name} — email check`, channel: "system", text: `This is the email check from the ${name} admin panel, sent at ${new Date().toISOString()}. Every step passed.` });
    sent = { ok: r.ok, to: g.email, error: r.error };
    steps.push({ name: `Test email to ${g.email}`, ok: r.ok, detail: r.ok ? `Accepted by SendGrid (message ${r.messageId ?? "queued"}). Check the inbox and spam.` : r.error ?? "Send failed" });
  }
  await audit(g.id, "setting.email_check", "setting", "SENDGRID_API_KEY", undefined, { ok: steps.every((s) => s.ok !== false), steps: steps.map((s) => `${s.name}: ${s.ok}`) }, g.email);
  return NextResponse.json({ ok: steps.every((s) => s.ok !== false), steps, sent });
}
