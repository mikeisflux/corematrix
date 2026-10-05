# DivinityCoin integration

ForeverComicCon takes every payment through **DivinityCoin**. The source of
truth for the partner API is the `divinitycoin` repo (`src/app/internal/route.ts`,
`src/proxy.ts`, `docs/PARTNER-API-CHANGES-2026-09.md`) and
https://divinitycoin.com/developers. Everything on our side is configured in
**Admin → Settings → DivinityCoin**; nothing is hard-coded.

## Keys

DivinityCoin issues three things on the partner portal. Only two are used here.

| DivinityCoin gives you | Where it goes | Notes |
|---|---|---|
| **Secret API key** `sk_forevercomiccon_…` (Partners → API keys) | `DIVINITYCOIN_API_KEY` | Sent as `Authorization: Bearer <key>` on every call. |
| **Webhook secret** (Partners → Settings → Webhook secret) | `DIVINITYCOIN_WEBHOOK_SECRET` | HMAC-SHA256 over the raw body, header `X-Webhook-Signature`. |
| **Public key** `pk_…` | not used | Only for browser SDK / Stripe Elements integrations. Our checkout is server-to-server plus DivinityCoin's hosted page, so it is never needed. |

Also paste our webhook URL into the partner record:
`https://forevercomiccon.com/api/webhooks/divinitycoin` (shown read-only in settings).

Set `DIVINITYCOIN_TEST_MODE` to **false** once the secret key is in. In test mode
the checkout frame loads a local simulator that posts signed events to our own
webhook and nothing is charged.

## Embedded (white-label) checkout

The hosted checkout is mounted in an iframe on `/app/checkout/<txId>`
(`src/components/DivinityCheckoutFrame.tsx`), so the buyer never leaves
forevercomiccon.com. The session is created with `disableAutoRedirect: true`
and `partnerLogoUrl: https://forevercomiccon.com/icon-512.png`; DivinityCoin
shows our logo and partner name on its page. It talks to ours with
`postMessage` (namespace `divinitycoin-checkout`: `ready`, `resize`,
`complete`). On `complete` we call `/api/checkout/confirm`, which asks
DivinityCoin for the authoritative session state (`get-checkout-session`),
captures the hold and settles the transaction, then navigates to
`/app/checkout/done`. A slow poll backs the message up.

**DivinityCoin side, required once:** its proxy sends
`Content-Security-Policy: frame-ancestors` on `/checkout/*` from the
`CHECKOUT_FRAME_ANCESTORS` environment variable. Our origins must be in it or
the browser blocks the frame (the page sits on "Loading secure checkout…"):

```
CHECKOUT_FRAME_ANCESTORS="https://forevercomiccon.com https://www.forevercomiccon.com https://indiecrowdfund.com https://*.indiecrowdfund.com https://playtimetcg.com https://www.playtimetcg.com"
```

Restart DivinityCoin after changing it. Until then our page opens the same
checkout full-page in the tab after 12 seconds (and offers a button at 6), so
buyers are never stuck; they come back to `/app/checkout/done` afterwards.

## Payment paths

1. **Hosted checkout** (`payment` mode) for claims, takeovers, boosts, banner
   upgrades, coin packs and hanging banners. The charge is auto-held as
   credits under our transaction id; we `capture` it so it settles to us.
   Events: `checkout.completed`, `payment.succeeded` (or `payment.failed`).
2. **Plans** (`setup` mode): saves a card; the first period and every renewal
   are `charge-saved-payment-method` calls from our side.
3. **Refunds** from Admin → Transactions → Refund (`refund`, cents).
4. **Disputes**: `dispute.created` is handled and recorded on the transaction.

Card-side calls and events use **cents**; the credit ledger (`hold`,
`capture`, `release`) uses **dollars**.

## Troubleshooting

- *HTML 403/404 from DivinityCoin*: the API URL is wrong. A real auth failure
  is JSON, e.g. `{"error":"Invalid or expired API key"}` or
  `{"error":"Partner account is not active"}` (approve the partner in the
  DivinityCoin admin).
- *"Loading secure checkout…" never clears*: our origin is missing from
  `CHECKOUT_FRAME_ANCESTORS` (see above).
- *Webhook rows failing in Admin → Webhooks*: the webhook secret here doesn't
  match the partner record. Re-run them from that page after fixing it.
- **Admin → Settings → "Test DivinityCoin"** pings the API with the saved key
  and shows the webhook URL to register.
