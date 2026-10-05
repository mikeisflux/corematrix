/* Back-compat shim: older call sites use sendMail(to, subject, html, text).
   Everything goes through SendGrid now (src/lib/sendgrid.ts) and is logged
   in /admin/emails. */
import { sendMail as sgSend, htmlToText } from "./sendgrid";

export async function sendMail(to: string, subject: string, html: string, text?: string, extra: { userId?: string; plotId?: number; txId?: string; templateSlug?: string; channel?: string } = {}): Promise<void> {
  await sgSend({ to, subject, html, text: text ?? htmlToText(html), ...extra });
}
