import { NextResponse } from "next/server";
import { sendMail } from "@/lib/sendgrid";
import { audit } from "@/lib/auth";
import { siteName } from "@/lib/settings";
import { guard, bad } from "../../_lib";
export const dynamic = "force-dynamic";
export async function POST() {
  const g = await guard(); if (g instanceof NextResponse) return g;
  const name = await siteName();
  const r = await sendMail({ to: g.email, subject: `${name} — SendGrid test`, channel: "system", text: `This is a test message from the ${name} admin panel, sent at ${new Date().toISOString()}. If you are reading it, SendGrid is configured.`, html: `<div style="background:#0b1020;color:#eef2ff;padding:24px;font-family:Arial,sans-serif"><h1 style="font-size:22px;margin:0 0 12px">SendGrid works.</h1><p>Sent from the ${name} admin panel at ${new Date().toLocaleString()}.</p></div>` });
  await audit(g.id, "setting.test_email", "setting", "SENDGRID_API_KEY", undefined, { ok: r.ok, error: r.error }, g.email);
  if (!r.ok) return bad(r.error || "Send failed", 502);
  return NextResponse.json({ ok: true, to: g.email, messageId: r.messageId });
}
