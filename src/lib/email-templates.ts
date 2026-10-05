/* Default transactional templates for ForeverComicCon. Dark navy, amber accent,
   table layout, inline CSS. {{var}} escapes, {{{var}}} is raw. Seeded from
   Admin → Emails → Templates → "Create default templates". */
const F = "Inter, Arial, Helvetica, sans-serif";
const RAMP = ["#ffcf5c", "#5ee6c3", "#5b8def", "#9b5de5", "#ff6b6b"];

function shell(title: string, body: string, cta?: { href: string; label: string }) {
  const ramp = RAMP.map((c) => `<td style="height:6px;background:${c};font-size:0;line-height:0">&nbsp;</td>`).join("");
  const button = cta ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 8px"><tr><td style="background:#ffcf5c;border-radius:12px"><a href="${cta.href}" style="display:inline-block;padding:14px 22px;font-family:${F};font-weight:800;font-size:14px;color:#0b1020;text-decoration:none">${cta.label}</a></td></tr></table>` : "";
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title></head>
<body style="margin:0;padding:0;background:#0b1020;color:#eef2ff;font-family:${F}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0b1020"><tr><td align="center" style="padding:0 16px 40px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%">
  <tr><td style="padding:0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${ramp}</tr></table></td></tr>
  <tr><td style="padding:28px 0 8px;font-family:${F};font-weight:800;font-size:14px;letter-spacing:.18em;text-transform:uppercase;color:#ffcf5c">{{siteName}}</td></tr>
  <tr><td style="border-top:1px solid #1f2746;padding:24px 0 0">
    <h1 style="margin:0 0 16px;font-family:${F};font-weight:800;font-size:28px;line-height:1.1;color:#ffffff">${title}</h1>
    <div style="font-family:${F};font-size:16px;line-height:1.55;color:#c9cfe6">${body}</div>
    ${button}
  </td></tr>
  <tr><td style="padding:32px 0 0;border-top:1px solid #1f2746">
    <p style="margin:20px 0 0;font-family:ui-monospace,Menlo,monospace;font-size:11px;letter-spacing:.08em;color:#7a82a6;line-height:1.7">
      {{siteName}} · <a href="{{siteUrl}}" style="color:#9aa4c7;text-decoration:none">{{siteUrl}}</a><br>
      Questions? <a href="mailto:{{supportEmail}}" style="color:#9aa4c7;text-decoration:none">{{supportEmail}}</a><br>
      © {{currentYear}} {{siteName}}.
    </p>
  </td></tr>
</table></td></tr></table>
</body></html>`;
}
const row = (label: string, val: string) => `<tr><td style="padding:6px 0;color:#7a82a6;font-family:${F};font-size:12px;text-transform:uppercase;letter-spacing:.1em">${label}</td><td align="right" style="padding:6px 0;color:#eef2ff;font-family:${F};font-size:14px">${val}</td></tr>`;
const p = (s: string) => `<p style="margin:0 0 14px">${s}</p>`;
const mono = (s: string) => `<span style="font-family:ui-monospace,Menlo,monospace;color:#ffcf5c">${s}</span>`;
const table = (rows: string) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #2a3356;margin:8px 0 16px">${rows}</table>`;

export interface DefaultTemplate { slug: string; name: string; description: string; subject: string; html: string; text?: string }

export const DEFAULT_TEMPLATES: DefaultTemplate[] = [
  { slug: "password_reset", name: "Password reset", description: "Sent from the forgot-password form. Vars: link", subject: "Reset your {{siteName}} password",
    html: shell("Reset your password.", p("Click the button to choose a new password. The link works once and expires in 20 minutes.") + p("If you didn’t request this, ignore it; your password stays the same."), { href: "{{link}}", label: "Choose a new password" }) },
  { slug: "welcome", name: "Welcome (first booth)", description: "Sent after the first claim. Vars: name, boothName, boothId", subject: "{{boothName}} is live on {{siteName}}",
    html: shell("You’re on the floor.", p("Your booth is live. Three things that make the difference:") +
      `<ol style="margin:0 0 14px;padding-left:20px"><li style="margin-bottom:8px"><b>Share your card</b>: <a href="{{siteUrl}}/app/booth/{{boothId}}" style="color:#ffcf5c">{{siteUrl}}/app/booth/{{boothId}}</a> renders a card when posted.</li><li style="margin-bottom:8px"><b>Put the badge on your site</b>: visitors click through and raise your trending rank.</li><li><b>Add the conversion pixel</b> to your thank-you page to see sales next to clicks.</li></ol>` +
      p("You’ll get an email the moment anyone takes over your booth (with your payout), and a weekly report every Monday."), { href: "{{siteUrl}}/app/dashboard?booth={{boothId}}", label: "Open your dashboard" }) },
  { slug: "receipt", name: "Payment receipt", description: "Sent when a payment settles. Vars: name, description, amount, txId, boothId", subject: "Receipt: {{description}}",
    html: shell("Thanks, {{name}}.", p("Your payment went through.") + table(row("Item", "{{description}}") + row("Amount", "<strong>{{amount}}</strong>") + row("Reference", mono("{{txId}}"))) + p("Paid securely through DivinityCoin."), { href: "{{siteUrl}}/app/dashboard", label: "View dashboard" }) },
  { slug: "sold", name: "Booth bought out", description: "Sent to the seller on a takeover. Vars: name, boothName, boothId, price, payout, profit", subject: "{{boothName}} was bought out for {{price}}. You earned {{profit}}.",
    html: shell("You got bought out.", p("Someone paid ${mono('{{price}}')} for ${mono('{{boothName}}')} (#{{boothId}}).") + table(row("You received", "<strong>{{payout}}</strong>") + row("Profit", "{{profit}}")) + p("It’s in your balance now. Spend it on a new booth, a takeover of your own, or a boost."), { href: "{{siteUrl}}/?claim=1", label: "Claim a new booth" }) },
  { slug: "takeover_nudge", name: "Takeover nudge", description: "Someone opened the takeover page. Vars: name, boothName, boothId, price, payout", subject: "Someone is looking at taking over {{boothName}}",
    html: shell("Someone’s eyeing your booth.", p("A visitor just opened the takeover page for ${mono('{{boothName}}')}. The current price is ${mono('{{price}}')}; if they buy, you receive {{payout}}.") + p("Want to make it harder? Boost: every dollar raises the price and your payout."), { href: "{{siteUrl}}/app/dashboard?booth={{boothId}}", label: "Boost your booth" }) },
  { slug: "season_result", name: "Season result", description: "Top-3 finish in a weekly season. Vars: name, boothName, boothId, rank, views, clicks, season, prize", subject: "{{boothName}} finished #{{rank}} this week",
    html: shell("Top {{rank}} this week.", p("${mono('{{boothName}}')} was #{{rank}} trending in season {{season}}: {{views}} views, {{clicks}} clicks.") + p("You won <b>{{prize}} coins</b> and a week on the home page."), { href: "{{siteUrl}}/app/dashboard?booth={{boothId}}", label: "Open your dashboard" }) },
  { slug: "weekly_digest", name: "Weekly report", description: "Monday report. Vars: name, sectionsHtml (raw)", subject: "Your {{siteName}} week",
    html: shell("Your week on the floor.", p("Here’s what your booths did this week.") + `{{{sectionsHtml}}}`, { href: "{{siteUrl}}/app/dashboard", label: "Open your dashboard" }) },
  { slug: "plan_started", name: "Plan started", description: "Vars: name, boothName, planName, amount, perks, boothId", subject: "{{boothName}} is now a {{planName}}",
    html: shell("You’re upgraded.", p("${mono('{{boothName}}')} is on the ${mono('{{planName}}')} plan.") + table(row("Plan", "{{planName}}") + row("Amount", "{{amount}} / 30 days")) + p("{{perks}}") + p("Renews every 30 days with the card you saved. Cancel any time from your dashboard."), { href: "{{siteUrl}}/app/dashboard?booth={{boothId}}", label: "Manage plan" }) },
  { slug: "plan_renewed", name: "Plan renewed", description: "Vars: name, boothName, planName, amount, periodEnd, boothId", subject: "{{planName}} renewed on {{boothName}}",
    html: shell("Renewed.", p("Your ${mono('{{planName}}')} plan on ${mono('{{boothName}}')} renewed for ${mono('{{amount}}')}. It runs through {{periodEnd}}.") + p("Nothing to do."), { href: "{{siteUrl}}/app/dashboard?booth={{boothId}}", label: "View dashboard" }) },
  { slug: "plan_payment_failed", name: "Plan payment failed", description: "Vars: name, boothName, planName, reason, boothId", subject: "Action needed: we couldn’t renew {{planName}} on {{boothName}}",
    html: shell("Payment didn’t go through.", p("We couldn’t collect the ${mono('{{planName}}')} renewal for ${mono('{{boothName}}')} ({{reason}}).") + p("Perks continue for 7 days while we retry daily. Update your card to avoid an interruption."), { href: "{{siteUrl}}/app/dashboard?booth={{boothId}}", label: "Update payment" }) },
  { slug: "plan_cancelled", name: "Plan ended", description: "Vars: name, boothName, boothId", subject: "The plan on {{boothName}} ended",
    html: shell("Plan ended.", p("The paid plan on ${mono('{{boothName}}')} has ended. Your booth stays; it’s back on the free plan.") + p("Upgrade again any time."), { href: "{{siteUrl}}/app/dashboard?booth={{boothId}}", label: "View dashboard" }) },
  { slug: "contact_autoreply", name: "Contact auto-reply", description: "Vars: name, subject", subject: "We got your message",
    html: shell("Got it.", p("Thanks for writing. A real person reads every message and we usually reply within one business day.") + p("Your subject: ${mono('{{subject}}')}")) },
  { slug: "admin_dispute", name: "Admin: chargeback", description: "Sent to the admin address on dispute.created. Vars: txId, reason, amount", subject: "Chargeback on transaction {{txId}}",
    html: shell("Chargeback opened.", p("A dispute was opened on ${mono('{{txId}}')} for {{amount}}: {{reason}}.") + p("Gather evidence in DivinityCoin before the deadline."), { href: "{{siteUrl}}/admin/transactions/{{txId}}", label: "Open transaction" }) },
];

export const SAMPLE_VARS: Record<string, unknown> = {
  name: "Alex", email: "alex@example.com", link: "https://forevercomiccon.com/app/login/reset?token=example", boothName: "Harbor Coffee Co.", boothId: 5, description: "Claim #5 · Harbor Coffee Co.",
  amount: "$50.00", txId: "tx_example", price: "$125.00", payout: "$115.00", profit: "$15.00", rank: 1, views: "1,204", clicks: "88", season: "2026-W40", prize: 300,
  sectionsHtml: `<h3 style="margin:16px 0 6px;color:#fff">Harbor Coffee Co. · #5 · rank #12 (up 3)</h3><p>412 views · 61 clicks · 14.8% CTR</p>`,
  planName: "Pro", perks: "Full analytics · Rooftop sign · Weekly report", periodEnd: "Nov 4, 2026", reason: "card_declined", subject: "Question about booths",
  siteName: "ForeverComicCon", siteUrl: "https://forevercomiccon.com", supportEmail: "hello@forevercomiccon.com", currentYear: new Date().getFullYear(),
};
