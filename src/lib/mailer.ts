import { SITE_NAME } from "@/lib/config";

/**
 * Minimal mail abstraction. With RESEND_API_KEY set, sends through Resend's
 * HTTP API (no SDK needed). Without it, logs the message so magic links are
 * usable in development.
 */
export async function sendMail(to: string, subject: string, html: string, text?: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? `${SITE_NAME} <onboarding@resend.dev>`;
  if (!key) {
    console.log(`\n[mail → ${to}] ${subject}\n${text ?? html}\n`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, html, text }),
  });
  if (!res.ok) {
    console.error("mail failed", res.status, await res.text());
  }
}
