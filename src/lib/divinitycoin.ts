/* DivinityCoin payment processor client (ported from the Play Time admin).

   DivinityCoin's partner API is one public HTTPS endpoint,
       POST https://divinitycoin.com/internal?action=<name>
   authenticated with  Authorization: Bearer <partner API key>.

   Units: card-side actions (create-checkout-session, refund, charge-saved-
   payment-method, payment.* webhooks) are in CENTS; the credit ledger
   (balance / hold / capture / release / validate) is in DOLLARS.

   Payment paths used here:
     1. Hosted checkout (embedded in /checkout) for claims, takeovers, boosts,
        coin packs and billboards. On completion DivinityCoin fires
        checkout.completed + payment.succeeded; the charge is auto-held as
        credits under our transaction id and we `capture` it.
     2. Plans: a `setup`-mode checkout saves a card; the first period and every
        renewal are charge-saved-payment-method calls from our side.

   Webhooks land on /api/webhooks/divinitycoin, signed with
       X-Webhook-Signature: t=<unix>,v1=<HMAC-SHA256(secret, "<t>.<raw body>")>
   and shaped { event, timestamp, data }. */

import { createHmac, timingSafeEqual } from "node:crypto";
import { getSettings, flag } from "./settings";

export interface CreditBalance { available: number; held: number; total: number }
export interface HoldResult { success: boolean; holdId?: string; error?: string; message?: string }
export interface SimpleResult { success: boolean; amount?: number; error?: string; message?: string }

export interface CustomerOrigin { ip?: string | null; userAgent?: string | null }

const PRIVATE_IP = /^(0\.|10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|::1$|::$|f[cd][0-9a-f]{2}:|fe80:)/i;
export function cleanOrigin(o?: CustomerOrigin | null): { ip: string | null; userAgent: string | null } {
  const ip = (o?.ip ?? "").trim();
  const ipOk = ip.length >= 3 && ip.length <= 45 && /^[0-9a-f.:]+$/i.test(ip) && !PRIVATE_IP.test(ip);
  const ua = (o?.userAgent ?? "").trim().slice(0, 512);
  return { ip: ipOk ? ip : null, userAgent: ua || null };
}
export function originFields(o?: CustomerOrigin | null): { customerIpAddress?: string; customerUserAgent?: string } {
  const c = cleanOrigin(o);
  return { ...(c.ip ? { customerIpAddress: c.ip } : {}), ...(c.userAgent ? { customerUserAgent: c.userAgent } : {}) };
}

export interface CheckoutInput {
  reference: string; amountCents: number; currency?: string; email: string; customerId: string; description: string;
  returnUrl: string; cancelUrl: string; expiresInMinutes?: number; embed?: boolean; origin?: CustomerOrigin | null;
}
export interface CheckoutResult { success: boolean; checkoutUrl?: string; sessionId?: string; expiresAt?: string; error?: string }
export interface SetupInput { reference: string; email: string; customerId: string; description: string; returnUrl: string; cancelUrl: string; embed?: boolean; origin?: CustomerOrigin | null }
export interface CheckoutSession {
  sessionId: string; status: "pending" | "complete" | "expired" | "canceled" | "failed";
  mode: "payment" | "setup"; amount: number | null; pledgeId: string | null;
  paymentIntentId: string | null; setupIntentId: string | null; paymentMethodId: string | null; platformUserId: string;
}
export interface ChargeResult { success: boolean; status?: string; paymentIntentId?: string; holdId?: string; error?: string; code?: string; declineCode?: string; httpStatus?: number }

export type DivinityEventType =
  | "checkout.completed" | "checkout.failed" | "checkout.expired" | "checkout.canceled"
  | "payment.succeeded" | "payment.failed" | "refund.completed" | "dispute.created" | "test.ping";

export const DC_PROJECT_ID = "forevercomiccon";

async function config() {
  const s = await getSettings(["DIVINITYCOIN_API_URL", "DIVINITYCOIN_API_KEY", "DIVINITYCOIN_WEBHOOK_SECRET", "DIVINITYCOIN_PARTNER_SLUG", "DIVINITYCOIN_INTERNAL_PATH", "DIVINITYCOIN_AUTH_HEADER", "DIVINITYCOIN_TEST_MODE", "DIVINITYCOIN_ALLOW_CREDITS", "SITE_URL"]);
  const site = (s.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
  return {
    baseUrl: (s.DIVINITYCOIN_API_URL || "https://divinitycoin.com").replace(/\/$/, ""),
    apiKey: s.DIVINITYCOIN_API_KEY,
    webhookSecret: s.DIVINITYCOIN_WEBHOOK_SECRET,
    partner: s.DIVINITYCOIN_PARTNER_SLUG || "forevercomiccon",
    internalPath: (s.DIVINITYCOIN_INTERNAL_PATH || "/internal").replace(/\/$/, ""),
    authHeader: s.DIVINITYCOIN_AUTH_HEADER || "Authorization",
    testMode: flag(s.DIVINITYCOIN_TEST_MODE),
    allowCredits: flag(s.DIVINITYCOIN_ALLOW_CREDITS, true),
    site,
    webhookUrl: `${site}/api/webhooks/divinitycoin`,
  };
}

function authHeaders(c: { authHeader: string; apiKey: string; partner: string }): Record<string, string> {
  const value = /^authorization$/i.test(c.authHeader) ? `Bearer ${c.apiKey}` : c.apiKey;
  return { [c.authHeader]: value, "X-Partner": c.partner };
}

export async function divinityConfigured(): Promise<boolean> { const c = await config(); return !!c.apiKey || c.testMode; }
export async function divinityTestMode(): Promise<boolean> { return (await config()).testMode; }
export async function divinityWebhookUrl(): Promise<string> { return (await config()).webhookUrl; }

export class DivinityApiError extends Error {
  constructor(message: string, public status: number, public body: Record<string, unknown>) { super(message); }
}

class DivinityCoinClient {
  private async call<T>(action: string, body: object, method: "POST" | "GET" = "POST"): Promise<T> {
    const c = await config();
    if (!c.apiKey) throw new Error("DivinityCoin is not configured (Admin → Settings → DivinityCoin).");
    const url = `${c.baseUrl}${c.internalPath}?action=${encodeURIComponent(action)}`;
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json", ...authHeaders(c) },
      body: method === "GET" ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
    const text = await res.text().catch(() => "");
    let json: Record<string, unknown> = {};
    try { json = text ? JSON.parse(text) : {}; } catch { json = { error: text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200) }; }
    if (!res.ok) {
      const msg = String(json.error || json.message || `HTTP ${res.status}`);
      console.error(`[divinitycoin] ${method} ${url} -> HTTP ${res.status}: ${msg}`);
      throw new DivinityApiError(`DivinityCoin ${res.status}: ${msg}`, res.status, json);
    }
    return json as T;
  }

  /* ─── credits (dollars) ─── */
  getBalance(userId: string) { return this.call<CreditBalance>("balance", { platformUserId: userId }); }
  placeHold(userId: string, amountDollars: number, reference: string, expiresAt?: Date): Promise<HoldResult> {
    return this.call<HoldResult>("hold", { platformUserId: userId, amount: amountDollars, pledgeId: reference, projectId: DC_PROJECT_ID, expiresAt: expiresAt?.toISOString() })
      .catch((e): HoldResult => { if (e instanceof DivinityApiError) return { success: false, error: String(e.body.message || e.body.error || e.message) }; throw e; });
  }
  async releaseHold(reference: string): Promise<SimpleResult> {
    if ((await config()).testMode) return { success: true };
    return this.call<SimpleResult>("release", { pledgeId: reference });
  }
  async captureHold(reference: string): Promise<SimpleResult> {
    if ((await config()).testMode) return { success: true };
    return this.call<SimpleResult>("capture", { pledgeId: reference });
  }

  /* ─── hosted checkout (cents) ─── */
  async createCheckout(input: CheckoutInput): Promise<CheckoutResult> {
    const c = await config();
    if (c.testMode) {
      const q = new URLSearchParams({ reference: input.reference, amount: String(input.amountCents / 100), success: input.returnUrl, cancel: input.cancelUrl, kind: "payment" });
      return { success: true, checkoutUrl: `${c.site}/app/checkout/simulate?${q}`, sessionId: `cs_test_${input.reference}` };
    }
    try {
      const d = await this.call<{ success: boolean; sessionId: string; checkoutUrl: string; expiresAt: string }>("create-checkout-session", {
        platformUserId: input.customerId, email: input.email, mode: "payment",
        amount: Math.round(input.amountCents), currency: (input.currency || "usd").toLowerCase(),
        pledgeId: input.reference, projectId: DC_PROJECT_ID,
        returnUrl: input.returnUrl, cancelUrl: input.cancelUrl, description: input.description,
        expiresInMinutes: input.expiresInMinutes ?? 60,
        partnerLogoUrl: `${c.site}/icon-512.png`,
        ...(input.embed ? { disableAutoRedirect: true } : {}),
        ...originFields(input.origin),
      });
      if (!d.checkoutUrl) return { success: false, error: "DivinityCoin did not return a checkout URL." };
      return { success: true, checkoutUrl: d.checkoutUrl, sessionId: d.sessionId, expiresAt: d.expiresAt };
    } catch (err) { return { success: false, error: String(err instanceof Error ? err.message : err) }; }
  }

  async createSetupCheckout(input: SetupInput): Promise<CheckoutResult> {
    const c = await config();
    if (c.testMode) {
      const q = new URLSearchParams({ reference: input.reference, success: input.returnUrl, cancel: input.cancelUrl, kind: "setup" });
      return { success: true, checkoutUrl: `${c.site}/app/checkout/simulate?${q}`, sessionId: `cs_test_setup_${input.reference}` };
    }
    try {
      const d = await this.call<{ success: boolean; sessionId: string; checkoutUrl: string; expiresAt: string }>("create-checkout-session", {
        platformUserId: input.customerId, email: input.email, mode: "setup",
        returnUrl: input.returnUrl, cancelUrl: input.cancelUrl, description: input.description, expiresInMinutes: 60,
        partnerLogoUrl: `${c.site}/icon-512.png`,
        ...(input.embed ? { disableAutoRedirect: true } : {}),
        ...originFields(input.origin),
      });
      if (!d.checkoutUrl) return { success: false, error: "DivinityCoin did not return a checkout URL." };
      return { success: true, checkoutUrl: d.checkoutUrl, sessionId: d.sessionId, expiresAt: d.expiresAt };
    } catch (err) { return { success: false, error: String(err instanceof Error ? err.message : err) }; }
  }

  async getCheckoutSession(sessionId: string): Promise<CheckoutSession | null> {
    if ((await config()).testMode) return null;
    try {
      const d = await this.call<{ success: boolean; session: CheckoutSession }>("get-checkout-session", { sessionId });
      return d.session ?? null;
    } catch (err) {
      if (err instanceof DivinityApiError && err.status === 404) return null;
      throw err;
    }
  }

  /* ─── saved cards (plans) ─── */
  async chargeSavedCard(input: { customerId: string; paymentMethodId: string; amountCents: number; reference: string; description: string; idempotencyKey: string; origin?: CustomerOrigin | null }): Promise<ChargeResult> {
    if ((await config()).testMode) return { success: true, status: "succeeded", paymentIntentId: `pi_test_${input.reference.replace(/[^a-z0-9]/gi, "")}` };
    try {
      const d = await this.call<{ success: boolean; status: string; paymentIntentId: string; holdId?: string }>("charge-saved-payment-method", {
        platformUserId: input.customerId, paymentMethodId: input.paymentMethodId,
        amount: Math.round(input.amountCents), currency: "usd",
        pledgeId: input.reference, projectId: DC_PROJECT_ID, description: input.description,
        idempotencyKey: input.idempotencyKey.replace(/[^A-Za-z0-9._:-]/g, "-").slice(0, 64),
        ...originFields(input.origin),
      });
      return { success: !!d.success, status: d.status, paymentIntentId: d.paymentIntentId, holdId: d.holdId };
    } catch (err) {
      if (err instanceof DivinityApiError) {
        const b = err.body;
        return { success: false, httpStatus: err.status, status: String(b.status || "failed"), error: String(b.error || err.message), code: b.code ? String(b.code) : undefined, declineCode: b.declineCode ? String(b.declineCode) : undefined, paymentIntentId: b.paymentIntentId ? String(b.paymentIntentId) : undefined };
      }
      return { success: false, error: String(err instanceof Error ? err.message : err) };
    }
  }
  async listPaymentMethods(customerId: string): Promise<Array<{ id: string; brand?: string; last4?: string; expMonth?: number; expYear?: number }>> {
    try { return (await this.call<{ paymentMethods: Array<{ id: string; brand?: string; last4?: string; expMonth?: number; expYear?: number }> }>("list-payment-methods", { platformUserId: customerId })).paymentMethods ?? []; }
    catch { return []; }
  }
  detachPaymentMethod(customerId: string, paymentMethodId: string) {
    return this.call<SimpleResult>("detach-payment-method", { platformUserId: customerId, paymentMethodId }).catch(() => ({ success: false }));
  }

  /* ─── refunds (cents) ─── */
  async refund(paymentIntentId: string, amountCents?: number, reason?: string, reference?: string, partial = false): Promise<SimpleResult & { refundId?: string }> {
    if ((await config()).testMode) return { success: true, amount: amountCents, refundId: `re_test_${Date.now()}` };
    try {
      const d = await this.call<{ success: boolean; refundId: string; amount: number; partial: boolean; status: string }>("refund", {
        paymentIntentId, amount: amountCents ? Math.round(amountCents) : undefined, reason, pledgeId: reference, partial,
      });
      return { success: !!d.success, amount: d.amount, refundId: d.refundId };
    } catch (err) { return { success: false, error: String(err instanceof Error ? err.message : err) }; }
  }

  async healthCheck(): Promise<{ ok: boolean; detail: string }> {
    try {
      const c = await config();
      if (c.testMode) return { ok: true, detail: "test mode — simulator in use, no live calls" };
      if (!c.apiKey) return { ok: false, detail: "API key not set" };
      const url = `${c.baseUrl}${c.internalPath}?action=health`;
      const res = await fetch(url, { headers: authHeaders(c), signal: AbortSignal.timeout(8000) });
      const body = (await res.text().catch(() => "")).replace(/\s+/g, " ").trim().slice(0, 300);
      if (!res.ok) return { ok: false, detail: `HTTP ${res.status}${body ? `: ${body}` : ""}` };
      return { ok: true, detail: body };
    } catch (err) { return { ok: false, detail: String(err) }; }
  }
}

export const divinitycoin = new DivinityCoinClient();

/* ─── webhook signature ─── */
export async function verifyWebhookSignature(rawBody: string, header: string | null, secretOverride?: string): Promise<{ ok: boolean; reason?: string }> {
  const secret = secretOverride ?? (await config()).webhookSecret;
  if (!secret) return { ok: false, reason: "DIVINITYCOIN_WEBHOOK_SECRET not configured" };
  if (!header) return { ok: false, reason: "missing signature header" };
  const parts = Object.fromEntries(header.split(",").map((p) => p.trim().split("=") as [string, string]));
  let expected: string;
  let provided: string;
  if (parts.v1 && parts.t) {
    const age = Math.abs(Date.now() / 1000 - Number(parts.t));
    if (!Number.isFinite(age) || age > 300) return { ok: false, reason: "timestamp outside tolerance" };
    expected = createHmac("sha256", secret).update(`${parts.t}.${rawBody}`).digest("hex");
    provided = parts.v1;
  } else {
    expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    provided = header.replace(/^sha256=/, "").trim();
  }
  const a = Buffer.from(provided, "hex"), b = Buffer.from(expected, "hex");
  if (a.length !== b.length || a.length === 0 || !timingSafeEqual(a, b)) return { ok: false, reason: "signature mismatch" };
  return { ok: true };
}

export function signWebhookPayload(rawBody: string, secret: string, t = Math.floor(Date.now() / 1000)): string {
  return `t=${t},v1=${createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex")}`;
}

export interface DivinityWebhookEvent {
  event: DivinityEventType | string;
  timestamp?: string;
  data: {
    sessionId?: string; mode?: "payment" | "setup"; status?: string;
    paymentIntentId?: string; setupIntentId?: string; paymentMethodId?: string;
    amount?: number; currency?: string; platformUserId?: string; email?: string;
    pledgeId?: string; projectId?: string;
    hold?: { holdId: string; amount: number; status: string } | null;
    paymentMethod?: { type?: string; brand?: string; last4?: string } | null;
    type?: "initial" | "upcharge"; error?: string; code?: string; declineCode?: string;
    refundId?: string; partial?: boolean;
    disputeId?: string; stripePaymentIntentId?: string; reason?: string; evidenceDueBy?: string;
    [k: string]: unknown;
  };
}
