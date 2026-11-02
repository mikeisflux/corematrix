/**
 * The site documentation, in one place. Rendered by the public guide (/help and /help/<slug>) and by the Help panel in
 * the hall, so both say the same thing. Written for visitors and exhibitors: what a thing is, where it is, how to use
 * it, what it costs, its limits. Keep it current: a feature that changes updates its section here in the same commit
 * (see CLAUDE.md). No React here so the server, the sitemap and the panel can all read it.
 */
import { BOOTH_SIZES, ZONES, TIERS, TAKEOVER_MULTIPLIER, SELLER_PREMIUM_SHARE, BOOK_PRICE_CENTS, PRODUCT_LIMIT, GALLERY_LIMIT, BILLBOARD_SLOTS, formatMoney } from "@/lib/config";
import { QUESTS, BONUS_COINS, COIN_RULES, GAMES, SEASON_PRIZES } from "@/lib/rules";
import { ITEMS } from "@/lib/hall/items";

export type Audience = "everyone" | "visitors" | "exhibitors" | "admins";
export interface DocBlock { h?: string; p?: string; steps?: string[]; bullets?: string[]; table?: { head: string[]; rows: string[][] }; tip?: string }
export interface DocSection { slug: string; title: string; icon: string; audience: Audience; summary: string; blocks: DocBlock[] }

const money = (c: number) => formatMoney(c);
const sizes = Object.values(BOOTH_SIZES);

export const DOCS: DocSection[] = [
  {
    slug: "start", title: "Getting started", icon: "🚪", audience: "everyone",
    summary: "What ForeverComicCon is, how the floor is laid out, and the two ways to see it.",
    blocks: [
      { p: "ForeverComicCon is one exhibit hall laid out like a real comic convention and open all day, every day. Publishers, artists, shops and fan projects own numbered booths along the aisles; the arcade and the theater sit in the middle; Artists' Alley runs along the east end. Walking the floor is free and needs no account." },
      { h: "Map and walk", bullets: [
        "The hall opens on the **map**: an overhead view. Drag to orbit, scroll to zoom, use WASD or the arrows to pan, click any booth to open it.",
        "Press the 🚶 button (bottom right on a desktop, bottom left on a phone) to **walk** the floor as your avatar. The same button, now 🗺️, takes you back to the map.",
        "Everything on the floor is live: people with a green triangle over their head are real visitors, and what you see them do is happening now.",
      ] },
      { h: "An account", p: "You can walk, open booths, play the theater and chat as a guest. Signing in (free, email and password) gives you a name over your head, coins and daily quests, direct messages and friends, the shop, and a booth of your own if you want one. The 👤 button on the right rail signs you in." },
      { h: "First visit", steps: ["Open the map and look around. The HEADLINERS strip at the top lists the week's featured booths.", "Press 🚶 to walk. A short card explains the controls the first time.", "Walk up to any booth and press E (or tap the card at the bottom) to open it.", "Ask ConBot, the robot in the arcade, for a guided tour (🧭 on the rail)."] },
    ],
  },
  {
    slug: "controls", title: "Controls and keys", icon: "⌨️", audience: "everyone",
    summary: "Every key, mouse action and touch gesture on the floor, plus the address parameters you can share.",
    blocks: [
      { h: "Keyboard and mouse (walk mode)", table: { head: ["Key", "Does"], rows: [
        ["W / ↑, S / ↓", "Walk forward and back"], ["A / D", "Sidestep"], ["← / →", "Turn"], ["Shift (hold)", "Run"], ["Drag the mouse", "Look around"],
        ["E or Enter", "Open the booth you are at, or talk to ConBot when you are next to it"], ["C", "Sit on a theater bench, or at your own booth's chair"], ["V", "Switch between first and third person"], ["M", "Back to the map"],
        ["1 to 8", "Play an emote (wave, dance, cheer, clap, bow, point, laugh, facepalm)"], ["T (hold)", "Talk, when voice chat is on (see Voice chat)"], ["Esc", "Close the open panel"],
      ] } },
      { h: "Phone", bullets: ["The joystick at the bottom right walks; push it to the rim to run.", "Drag anywhere else to look around.", "Cards appear at the bottom of the screen when you reach a booth, a seat, ConBot or a giveaway; tap them.", "The menu is at the bottom left so the right thumb keeps the stick."] },
      { h: "Map mode", bullets: ["Drag to orbit, scroll or pinch to zoom, WASD or arrows to pan.", "Click a booth to open its storefront; the Top booths and Live lists on the left jump to a booth."] },
      { h: "Links you can share", table: { head: ["Address", "Opens"], rows: [
        ["/app?booth=42", "The hall with booth 42 selected"], ["/app?booth=42&mode=walk", "Walks you to the booth"], ["/app?at=120,-40", "Puts you at a spot on the floor (people share this as \"meet me here\")"],
        ["/app?tour=headliners", "Starts a guided tour"], ["/app?claim=1", "The claim-a-booth flow"], ["/app?arcade=1", "The arcade panel"], ["/app?conbot=1", "Calls ConBot over"], ["/app?night=1", "After-hours lighting"],
        ["/app/booth/42", "A booth's public page"],
      ] } },
    ],
  },
  {
    slug: "booths", title: "Visiting a booth", icon: "🪧", audience: "visitors",
    summary: "What opens when you walk up to a booth: links, the comics on the table, the shop, a portfolio, who is there, and sharing.",
    blocks: [
      { p: "Walk up to a booth and press E, or click it on the map. The storefront panel opens on the left (a sheet at the bottom on a phone). Clicking a banner on the floor opens the exhibitor's website in a new tab; the hall stays open here." },
      { h: "What is in the storefront", bullets: [
        "**Links**: website, GlobalComix, ArtStation, DeviantArt, Instagram, Facebook, X. All open in a new tab.",
        "**Who is here**: whether the exhibitor is on the floor right now, how many people are browsing, and a Say hi button that opens a direct message.",
        "**On the table**: the comics standing on the table. Tap a cover for a full-size view; Buy opens the exhibitor's store.",
        "**Shop**: items the exhibitor sells, with prices. Opening one shows the picture, price and a Buy button; buying happens on the exhibitor's own site in a new tab, and the press counts for the booth.",
        "**Portfolio** (Artists' Alley): the artist's pieces. The three framed prints on the table's drape flip through the portfolio while you stand there. Tap a piece for the full view, Buy a print where there is one, and Commission me to ask for a commission by email or on their site.",
        "**About**, **Signage** (their banner art), the numbers (value, rank, visits this week), and the ownership history.",
        "**Walk to the booth** switches to walk mode and takes you there. **Share** opens the share card and buttons.",
        "**Take over this booth**: any booth can be bought from its owner for 1.25× its value; see Claiming a booth.",
      ] },
      { h: "Giveaways", p: "A booth may be giving away a shop item (a costume or a reaction pack) for a while. It is announced on the live feed, listed under 🛍️ Shop, and shown in the storefront. Stand at the booth and tap Claim; the item is yours for good." },
      { h: "Sharing a booth", p: "Share shows a card drawn from the booth's own art and logo, with buttons for X, Bluesky, Facebook and Reddit, a link to copy (for Discord or messages), the phone's share sheet with the card attached, and the card as a download. Every share link is tagged, so the exhibitor can see where visitors came from." },
    ],
  },
  {
    slug: "claim", title: "Claiming a booth", icon: "🏪", audience: "exhibitors",
    summary: "Prices by size and zone, how a claim works, takeovers, boosts, codes and plans.",
    blocks: [
      { h: "Spaces and prices", table: { head: ["Space", "Base price", "What it is"], rows: sizes.map((s) => [`${s.short} · ${s.name}`, money(s.priceCents), s.blurb]) } },
      { p: `Zones multiply the base price: ${ZONES.headliner.name} (${ZONES.headliner.mult}×) ${ZONES.headliner.blurb} ${ZONES.front.name} (${ZONES.front.mult}×) ${ZONES.front.blurb} ${ZONES.standard.name} and ${ZONES.artist.name} are 1×.` },
      { h: "Claiming", steps: ["Click an open space on the map (grey, \"AVAILABLE\" sign on the floor), or press Get a booth at the top left and pick one.", "Set it up in the designer: name, tagline, category, colours, banner style, table cloth. The floor previews it live.", "Pay by card through the checkout, or with credit, promo credit or a booth code. Your booth is live the moment payment lands.", "Open the dashboard (Manage this booth) to add your logo, art, links, comics, a shop and your portfolio."] },
      { h: "Value, takeovers and boosts", bullets: [
        "What you paid is your booth's **value**, and value is the rankings. Higher value brings bigger signage: a header banner, a hanging sign from the trusses, then a tower.",
        `Anyone can **take over** a booth for ${TAKEOVER_MULTIPLIER}× its value. The previous owner gets their full value back plus ${Math.round(SELLER_PREMIUM_SHARE * 100)}% of the premium as instant credit, and a notification. Value an owner got free (a code, converted coins, admin credit) is not paid out.`,
        "**Boost** your booth from the dashboard to raise both its value and the takeover price. Headliner booths get a 7-day shield after a claim or takeover.",
        "Every booth has a 3×6 ft roll-up banner. Exhibitor booths can make it taller, up to 8×16 ft, for $2 per foot, one-time; it counts toward value. Artists' Alley tables keep the 3×6.",
        `**Display a book**: each comic stand on your table is ${money(BOOK_PRICE_CENTS)}, one-time (4 stands per table).`,
      ] },
      { h: "Plans", table: { head: ["Plan", "Price", "Includes"], rows: Object.values(TIERS).map((t) => [t.name, t.priceCents ? `${money(t.priceCents)} / 30 days` : "free", t.perks.join(" · ")]) } },
      { h: "Codes", p: "A booth code (from a promotion or a partner) pays part or all of a claim. Enter it in the checkout. Value a code paid is marked free and is not paid out on a takeover." },
      { h: "Refunds", p: "Full refund within 24 hours of a claim if the booth has had no clicks or takeovers. Plans renew every 30 days and can be cancelled any time; perks run to the end of the period." },
    ],
  },
  {
    slug: "dashboard", title: "Your booth and the dashboard", icon: "🛠️", audience: "exhibitors",
    summary: "Everything an exhibitor edits: details and links, art for every slot, comics, portfolio, shop, share card, teams, pixel and badge.",
    blocks: [
      { p: "Open the dashboard from the storefront (Manage this booth), the Dashboard link at the bottom of the hall, or /app/dashboard. Pick a booth on the left if you have several. Changes reach the floor the moment you save." },
      { h: "Edit booth", bullets: ["Name, tagline, description, website and the six social links (a handle is enough for Instagram, X, ArtStation, DeviantArt, Facebook and GlobalComix).", "Logo: upload an image or paste a URL. PNG, JPG, WebP or GIF.", "Artists' Alley tables also set **Commissions** (a link or an email) and a one-line note such as \"Open for commissions from $40\"; the gallery gets a Commission me button."] },
      { h: "Artwork slots", table: { head: ["Slot", "Ratio", "Where it shows"], rows: [
        ["Roll-up banner", "1:2 (1200×2400)", "The retractable banner behind your table"], ["Wide banner", "4:1 (2000×500)", "Back wall, header on posts, hanging sign"], ["Table drape", "3:1 (1800×600)", "The front of the table skirt, fitted and centred"],
        ["Comic cover", "2:3 (600×900)", "A stand on your table"], ["Tower wrap", "1:8 (300×2400)", "Islands: all four faces of the tower"], ["Floor graphic", "1:1 (2000×2000)", "Islands: the carpet"], ["Island roll-ups", "1:2", "Islands: one banner per side"],
        ["Portfolio piece", "4:5 (960×1200)", "Artists' Alley: the framed prints and the gallery"], ["Product photo", "1:1 (800×800)", "An item in your shop"],
      ] } },
      { p: "Uploads take PNG, JPG, WebP or a PDF (first page), up to 12 MB, and are cropped to the slot's ratio. Each slot's card says the physical size on the floor and what reads well from the aisle." },
      { h: "Books on display", p: `Unlock a stand (${money(BOOK_PRICE_CENTS)} each), upload the front cover, and add a buy link under it. Visitors see the covers on your table and in the storefront, and Buy opens your store.` },
      { h: "Portfolio (Artists' Alley)", p: `Up to ${GALLERY_LIMIT} pieces. The three framed prints on your drape show them and flip through the set while someone is at your table; the storefront and your public page show the whole gallery. Add a link under a piece to sell it as a print.` },
      { h: "Shop", p: `List up to ${PRODUCT_LIMIT} items with a name, price, a line about it, a square photo and the link to buy it on your own store (Shopify, Gumroad, your site). Visitors open the item inside the hall and buy on your page; every Buy press counts as a click from the source \"shop\", and the dashboard shows presses per item.` },
      { h: "Share your booth", p: "A card drawn from your banner art and logo, ready to post to X, Bluesky, Facebook or Reddit, copy for Discord, share from a phone with the card attached, or download. A caption is prepared for you. Each link is tagged so the referrer report shows what it brought." },
      { h: "Teams", p: "Add people to a team so they can sit at your booth's chairs and be shown as crew. Friends from the floor can be added by name; anyone else by email." },
      { h: "Conversion pixel and badge", p: "Put the one-line pixel on your thank-you page (with ?v= the order value in cents) to see sales next to clicks. The badge is an image that links back to your booth; clicks through it count as referrals." },
    ],
  },
  {
    slug: "analytics", title: "Your numbers", icon: "📈", audience: "exhibitors",
    summary: "What each metric means, where to read them, and what the weekly place is.",
    blocks: [
      { h: "In the hall", p: "Open your own booth on the floor: the storefront shows a Your numbers card with this week's place (\"#12 of 300 booths by visits\"), 14 days of visits per day, your average stay, banner clicks and link-outs, and a link to the full dashboard." },
      { h: "The metrics", table: { head: ["Metric", "Meaning"], rows: [
        ["Impressions", "Times your booth was on someone's screen on the floor"], ["Unique visitors", "Distinct people who opened your booth, per day"], ["Booth visits", "Times the storefront or your public page was opened"],
        ["Avg time at booth", "How long a visitor stays: within reach of your booth on the floor, or with the storefront open"], ["Website clicks (link-outs)", "Every click out: banner, website button, social links, comics, shop, prints, commissions"],
        ["Banner clicks", "The clicks that came from the banner on the floor itself"], ["CTR", "Clicks divided by visits"], ["Conversions", "Sales your pixel reported, with the value"], ["Where clicks come from", "Referrers: walk-ups, the map, rankings, the directory, your badge, each share network, the shop, comics"],
      ] } },
      { h: "Rank and the weekly place", p: `Rank is by value, across every claimed booth. The weekly place is by visits since Monday. Every Monday the week closes: the top three by visits win ${SEASON_PRIZES.join(", ")} coins and a week on the home page as headliners; your dashboard shows how your rank moved.` },
      { p: "The free plan keeps 30 days of history; Pro keeps 90 and adds the referrer breakdown. Visitors see 7 days of visits on your public page and nothing else." },
    ],
  },
  {
    slug: "coins", title: "Coins, quests and seasons", icon: "🪙", audience: "everyone",
    summary: "How coins are earned, the three daily quests, what coins buy, and how the week's season works.",
    blocks: [
      { h: "Earning coins", bullets: [
        `**Showing up**: ${COIN_RULES.dailyVisit} coins the first time you open the hall each day, +${COIN_RULES.streakBonusPerDay} per day of streak (up to +10).`,
        `**Exploring**: ${COIN_RULES.explore} coin for each booth you open for the first time that day, up to 10 a day.`,
        `**Daily quests** (📜 on the rail): ${Object.values(QUESTS).map((q) => `${q.title.toLowerCase()} (${q.coins})`).join(", ")}, and ${BONUS_COINS} more for all three in a day. Progress counts by itself; collect each in the panel. Days reset at midnight UTC.`,
        "**Arcade prizes**: beat a machine's prize score and win its prize, up to three times per game per day.",
        `**Claiming a booth**: ${COIN_RULES.claim} coins. **Referrals**: coins for you and the friend when they first pay.`,
        "**Packs**: 100, 350 or 1000 coins for a couple of dollars in 🕹️ Arcade.",
      ] },
      { h: "Spending coins", bullets: [
        "The arcade machines cost 1 to 3 coins a round; the Hall Flyover drone ride costs 5.",
        "The 🛍️ Shop sells costumes and reaction packs for coins.",
        `**Convert coins into booth value** from the dashboard: ${COIN_RULES.convertRate} coins become $1 of value on your booth, which is what the rankings count. Coins never cash out.`,
      ] },
      { h: "Seasons", p: "A season is one week, Monday to Monday (UTC). The week's most-visited booths are the trending board; at the close the top three win coins and a week as headliners on the home page and in the hall, and everyone's rank is stored so the dashboard can show the move. /app/seasons shows past seasons; /app/rankings the live boards by value, visits, clicks, trending, newest and category." },
    ],
  },
  {
    slug: "arcade", title: "Arcade and theater", icon: "🕹️", audience: "everyone",
    summary: "The machines, the flyover, and the film playing in the middle of the hall.",
    blocks: [
      { h: "Machines", table: { head: ["Game", "Coins a round", "Prize"], rows: Object.values(GAMES).map((g) => [g.name, String(g.cost), `${g.prize} coins at ${g.prizeAt.toLocaleString()} points`]) } },
      { p: "Open 🕹️ Arcade on the rail or walk into the arcade in the middle of the hall and click a cabinet. Each game is a page of its own; your best scores and today's leaderboard are on it. Finishing a round, however it went, counts for the daily quest." },
      { h: "Hall Flyover", p: "5 coins for a 60-second drone ride over every booth in the hall. Press the pad in the arcade or the button in the Arcade panel." },
      { h: "Theater", bullets: [
        "A film plays on the big screen in the arcade around the clock, the same moment for everyone. Walk up to hear it: tap the Now showing card (or click the screen) for sound; sound turns off when you leave the arcade.",
        "Sit on a bench with C. Five minutes near the screen while a film plays completes a daily quest.",
        "The film is streamed in quality rungs that follow your connection. If your browser has no H.264 decoder (some Firefox installs), a WebM version plays instead.",
      ] },
    ],
  },
  {
    slug: "avatar", title: "Your avatar, emotes and the shop", icon: "🧑‍🎤", audience: "everyone",
    summary: "Making your avatar, emotes and reactions, and the shop's costumes, reaction packs and booth giveaways.",
    blocks: [
      { h: "Your avatar", p: "🧑‍🎤 on the rail: body, skin tone, hair and colour, shirt and pants, and cosplay presets (original looks, no trademarked characters). The look is saved on your device, and on your account when you are signed in, so it follows you. Your name and an optional job title (shown under the name) are set at the top of the panel and need an account." },
      { h: "Emotes and reactions", p: "🙌 Emotes: eight emotes everyone nearby sees (also keys 1 to 8 while walking), and reactions that pop over your head. Moving cancels an emote." },
      { h: "The shop", bullets: [
        `🛍️ Shop on the rail. Costumes: ${ITEMS.filter((i) => i.kind === "costume").map((i) => `${i.name} (${i.coins})`).join(", ")} coins. Reaction packs: ${ITEMS.filter((i) => i.kind === "reactions").map((i) => `${i.name} (${i.coins})`).join(", ")} coins.`,
        "Bought items are yours for good and show on your account anywhere. A costume you don't own shows 🔒 in the avatar panel and takes you to the shop.",
        "**Giveaways**: a booth may sponsor an item for a few days. It is announced on the live feed and listed at the top of the shop with the booth's name. Walk up to that booth and claim it there; it must be claimed standing at the booth.",
      ] },
    ],
  },
  {
    slug: "people", title: "People, chat and messages", icon: "👥", audience: "everyone",
    summary: "Hall chat, direct messages, friends, teams and what others see of you.",
    blocks: [
      { bullets: [
        "**Hall chat** (💬): one room for everyone on the floor; messages also appear as bubbles over heads. Signed-in visitors post; only exhibitors may post links. Mention someone with @handle to notify them.",
        "**People** (👥): everyone on the floor right now, with a Say hi (direct message) and a copy-my-spot link. Click a person's avatar on the floor to message them.",
        "**Direct messages** stay between the two of you and work for guests on the floor as well as accounts; an account keeps them across devices.",
        "**Friends**: send a request from a person's card; friends show a toast when they arrive on the floor and can be added to your team.",
        "**Teams** (🎟️): an exhibitor's crew. Members can sit at the booth's chairs and are listed as staff.",
        "**Voice chat**: optional push-to-talk with people within a few feet; see Voice chat.",
        "**Away**: switch tabs and you stay on the floor, marked away, for a couple of minutes.",
      ] },
    ],
  },
  {
    slug: "tours", title: "Guided tours", icon: "🧭", audience: "visitors",
    summary: "ConBot leads you booth to booth with a route line on the floor.",
    blocks: [
      { p: "Open 🧭 Guided tours on the rail, or ask ConBot (the robot in the arcade) to show you around. Pick a tour: Headliners, New this week, Artists' Alley, the arcade and theater, or a category. ConBot walks ahead to each stop, a line on the floor shows the way, and a bar at the bottom of the screen names the stop with Open booth, Next stop and End. Tours can be started from a link: /app?tour=headliners." },
    ],
  },
  {
    slug: "voice", title: "Voice chat", icon: "🎙️", audience: "everyone",
    summary: "Push-to-talk voice with people within a few feet, off by default.",
    blocks: [
      { p: "Turn voice chat on in ⚙️ Settings. The browser asks for the microphone once. Then hold T (or press and hold the talk button) to speak to people within a few feet of you; release to stop. Nobody hears you unless you hold the key. Audio goes straight between browsers, not through the server, and nothing is recorded. People who are talking show a 🔊 next to their name. Text chat always works as well." },
    ],
  },
  {
    slug: "banners", title: "Hanging banners", icon: "🪧", audience: "exhibitors",
    summary: "Advertising that hangs from the trusses, by the week.",
    blocks: [
      { p: `${BILLBOARD_SLOTS.block.name} from ${money(BILLBOARD_SLOTS.block.priceCentsPerWeek)} a week: ${BILLBOARD_SLOTS.block.blurb} ${BILLBOARD_SLOTS.airship.name} ${money(BILLBOARD_SLOTS.airship.priceCentsPerWeek)} a week: ${BILLBOARD_SLOTS.airship.blurb} Book one under 🪧 Hanging banners; every banner shows live seen, opens and clicks.` },
    ],
  },
  {
    slug: "settings", title: "Settings and performance", icon: "⚙️", audience: "everyone",
    summary: "Quality, frame-rate cap, first person, safe mode, and what to do when the hall is slow.",
    blocks: [
      { bullets: [
        "**Quality** picks itself from your frame rate (phones start low) and can be pinned in ⚙️ Settings. Low turns off shadows and the crowd's extras.",
        "**Frame-rate cap** saves battery on laptops and phones.",
        "**First person** (V) hides your avatar and looks from its eyes.",
        "**After hours** (🌙) dims the house lights.",
        "**Safe mode** (/app?safe=1, or the button if the graphics driver drops): the hall without the heavier effects.",
        "**Reload after a deploy**: a tab opened before an update may show a panel that will not load; the hall reloads itself once onto the new build.",
      ] },
      { h: "Browsers", p: "Any current Chrome, Edge, Safari or Firefox with WebGL. Voice chat needs a browser with WebRTC (all of those). On a Firefox without system video codecs the theater plays its WebM version." },
    ],
  },
  {
    slug: "rules", title: "Rules and refunds", icon: "📜", audience: "everyone",
    summary: "The short list.",
    blocks: [
      { bullets: [
        "Full refund within 24 hours of a claim if the booth has had no clicks or takeovers.",
        "Plans renew every 30 days and can be cancelled any time; perks run to the end of the period.",
        "No hate, scams, adult content or impersonation. Booths that break this are removed and the current value refunded as credit.",
        "Only exhibitors can post links in hall chat. Rate limits apply to everyone: chat, messages, uploads, tracking.",
        "Voice chat is push-to-talk, opt-in, peer to peer and never recorded. Mute anyone by turning voice off.",
      ] },
    ],
  },
  {
    slug: "admin", title: "For administrators", icon: "🛡️", audience: "admins",
    summary: "Where the operator tools are.",
    blocks: [
      { p: "/admin (superadmins, and staff with an area permission): booths (details, release, transfer, shield, feature, sponsored giveaways), users, transactions and payouts, codes, plans, billboards, the theater (films, encoding and downsampling), emails (compose, templates, inbox, logs), webhooks, errors, performance captures, the audit log and settings (site URL, payments, email)." },
    ],
  },
];

export const docBySlug = (slug: string): DocSection | undefined => DOCS.find((d) => d.slug === slug);
/** Plain text of a section for search in the Help panel. */
export const docText = (d: DocSection): string => [d.title, d.summary, ...d.blocks.flatMap((b) => [b.h ?? "", b.p ?? "", ...(b.steps ?? []), ...(b.bullets ?? []), ...(b.table?.rows.flat() ?? []), b.tip ?? ""])].join(" ").toLowerCase();
