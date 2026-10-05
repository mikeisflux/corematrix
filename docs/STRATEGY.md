# AlwaysOnCon: revenue, growth and engagement plan

## The pivot: AlwaysOnCon

The city became a comic convention hall. Same economy (claim, takeover, boost, plans, coins),
but the thing people buy is a booth on a floor plan they already understand: 10×10 inline,
20×10 corner, 20×20 island, 6×10 Artists' Alley table. Position is the status game
(Headliner Row around the arcade, front of house), signage grows with value, and the
walkthrough with avatars gives visitors a reason to come back: a con that never closes.

## The diagnosis

Claim Avenue sells a $5 to $1,000 building and the buyer gets a link and a vanity rank.
The chat says the rest: "wtf is this? I bought two buildings but I don't understand how this
goes", "is this dying? 8 online is quite low", and link spam. The founder's own question in
September ("have those visits generated sales, registrations, leads?") is the one his
product cannot answer. The roadmap since then is interiors, driving, boats, avatars and an
arcade with one player on the leaderboard: more things for visitors to do, nothing for
buyers to get.

Three structural problems:

1. **One-shot revenue.** Claims and takeover premiums. Revenue dies when the hype or the
   booths run out.
2. **No value loop for owners.** Owners can't see what they got, so they don't come back,
   don't upgrade, and tell people it's pointless.
3. **No reason to return.** A visitor sees the hall once. There's no daily hook, no
   season, no progression.

## What AlwaysOnCon does instead

### Revenue: five streams, two of them recurring

| Stream | Mechanic | Why it works |
| --- | --- | --- |
| Claims | floors × $5, zoned minimums on premium addresses | "How tall do I want to be" is a better purchase decision than "how much do I spend". People pick 50 floors, not $5. |
| Takeover premium | buyer pays 1.25×, seller gets value + 60% of premium, platform keeps 40% of premium | Sellers *profit* from being bought, so takeovers are drama they want. Platform earns on every flip forever. |
| Boosts & coin packs | add value to grow taller / defend; buy coins | Status spend. Coin packs are the arcade's cash register. |
| **Plans (MRR)** | Pro $9/mo, Landmark $49/mo | Analytics depth, height bonus, featured placement, takeover shield. Monthly, not once. |
| **Billboards** | block boards $20/wk, airship $49/wk, self-serve, live stats | The first real buyer on Claim Avenue was a billboard sponsor. Make it a product. |

Target mix at 1,000 owners: ~25% on Pro/Landmark → $4–6k MRR before any claims or ads.

### The owner value loop

Owner gets something measurable, every day:

- **Impressions** (seen on the floor), **uniques**, **views**, **clicks**, **CTR**, deltas vs
  the previous period, referrers (banner / walk-up / map / rankings / directory / embed / X).
- **Conversions**: a one-line pixel on their thank-you page reports signups or sales (with
  value). This is the metric that justifies the Pro plan and the next boost.
- Outbound links carry UTMs so their Google Analytics agrees with ours.
- Email the moment a takeover happens ("you earned $X"), weekly digest for Pro.
- A first-run checklist (logo, link, tagline, first click, 50 views) so nobody buys and
  then asks "what do I do".

### Engagement: reasons to come back

- **Daily coins + streaks**: show up, get coins. Explore booths, get coins.
- **Arcade with stakes**: three original machines (no licensing problems), coin entry,
  coin prizes, daily and all-time boards. Beat the daily record → you're in the live feed.
- **Coins become height**: 100 coins = $1 of value. Play → grow your tower → rank higher.
  Players and owners become the same people.
- **Hall Flyover**: a 60-second drone ride over the whole exhibit hall. Costs coins, shows
  off every booth (impressions for exhibitors), and is the thing people screen-record.
- **Weekly seasons**: trending leaderboard resets Monday; top 3 get featured all week.
- **Takeover drama**: public ownership history on every booth; sellers profit so nobody
  rage-quits.
- **Districts**: Crypto Row vs Startup Alley vs Creator Corner give communities a home and
  a rivalry.

### Growth loops

- **Referrals**: both sides get $2 credit + 25 coins when a friend claims.
- **Share cards**: every booth has an OG image (1200×630) that renders a mini floor plan;
  one-click "Share on X".
- **Embed badge**: an SVG badge for owners' sites that links back (and counts as a
  referrer). Every owner becomes a distribution channel.
- **SEO**: a server-rendered public page per booth and a directory. "Harbor Coffee Co.
  on AlwaysOnCon" is indexable; Claim Avenue's booth pages are thin.
- **Billboard advertisers** bring their own audience to check their numbers.

### Trust (because "is this a scam" is the top objection)

- Public, live show statistics (on the floor, visits, booth visits, website clicks).
- Rules page: takeover math with a worked example, refund window (24h, no interactions),
  content policy.
- Chat anti-spam: only owners can post links; rate limits; dedupe.
- Email receipts; DivinityCoin test mode for demos.

## What to measure (built into /admin)

- Revenue/day and by product, MRR from plans, ARPPU.
- Visit → checkout start → paid funnel.
- Signups/day, owners, paying users.
- **Outbound clicks delivered** (the value we create for owners; if this stalls, churn follows).
- Per-owner: CTR and conversions (the numbers that sell the Pro plan).

## Status

Everything above is implemented: subscriptions with renewals and cancellation, weekly
seasons with prizes, featured winners and rank snapshots, the conversion pixel, referrers,
hanging banners with live stats, the arcade and flyover, referrals, share cards, badges, the
weekly digest, the sold email and the takeover nudge, chat anti-spam, and the operator
dashboard.

## Roadmap after v1

1. Cash-out of seller credit through DivinityCoin payouts.
2. Panel rooms: scheduled live events in the hall (coins), a stage with sponsor banners
   slots, seasonal events (block parties: claims 50% off for 2 hours, announced in the feed).
3. Building guestbooks (per-booth chat rooms) for Pro+.
4. Coinbase Commerce as a second checkout for the crypto crowd.
5. Mobile: touch controls are in; add a 2D minimap mode for low-end phones.
6. Multi-instance realtime (Redis) when a single box isn't enough.
