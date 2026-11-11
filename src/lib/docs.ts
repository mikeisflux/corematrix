/**
 * The site documentation, in one place. Rendered by the public guide (/help and /help/<slug>) and by the Help panel in
 * the hall, so both say the same thing. Written for visitors and exhibitors: what a thing is, where it is, how to use
 * it, what it costs, its limits. Keep it current: a feature that changes updates its section here in the same commit
 * (see CLAUDE.md). No React here so the server, the sitemap and the panel can all read it.
 */
import { BOOTH_SIZES, ZONES, TIERS, TAKEOVER_MULTIPLIER, SELLER_PREMIUM_SHARE, BOOK_PRICE_CENTS, PRODUCT_LIMIT, GALLERY_LIMIT, BILLBOARD_SLOTS, formatMoney } from "@/lib/config";
import { QUESTS, BONUS_COINS, COIN_RULES, GAMES, SEASON_PRIZES } from "@/lib/rules";
import { SLOT_BETS, SLOT_RTP, SLOT_SYMBOLS } from "@/lib/slots-table";
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
      { h: "Finding your way", bullets: [
        "**The plan**: Halls A to H run west to east along the building. Aisles are numbered 100 to 2800 and hang a number sign at the front, at the back and over the boulevard; booth numbers run along each aisle (odd numbers on the west side, even on the east). Artists' Alley rows are lettered AA-A to AA-L, with their own signs.",
        "**The boulevard**: a 30 ft main aisle crosses the hall halfway back, with the arcade and theater in the middle. Halfway down each half a cut-through lane lets you change aisles without walking to the end.",
        "**Directory kiosks**: the dark pylons with a lit map beside every entrance and along the boulevard show the plan with a YOU ARE HERE dot. Click one (or press 🔍) to search booths, artists and shops; a result walks you there.",
        "**Floor arrows** on the boulevard point to Artists' Alley, the exhibit halls and the arcade. The **minimap** (bottom left on a computer, M to hide) shows where you and everyone else are; click it to walk to a spot.",
      ] },
      { h: "Map and walk", bullets: [
        "The hall opens on the **map**: an overhead view. Drag to orbit, scroll to zoom, use WASD or the arrows to pan, click any booth to open it.",
        "Press the 🚶 button (bottom right on a desktop, bottom left on a phone) to **walk** the floor as your avatar. The same button, now 🗺️, takes you back to the map.",
        "**Instructions** live in three places: this Help panel (❓ at the bottom of the button bar), the help pages at /help, and the step-by-step guides with pictures linked in the site footer (Virtual comic con, Online artist alley, Exhibit, Promote your comic).",
        "**Your name**: a free account lets you set a display name and an @handle under Account (👤). Handles are unique, so the first to take one keeps it; people mention you in chat with it.",
        "Everything on the floor is live: people with a green triangle over their head are real visitors, and what you see them do is happening now.",
        "**When the hall is full**: the floor takes a set number of people walking at once (400 by default). Press Walk past that and a card says the hall is full, with your place in line and a rough wait; keep the tab open and you are walked in automatically, first come first served, as people leave. The map, every booth, the chat and the theater stay open while you wait, and Browse the map lets you look around in the meantime.",
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
        ["W / ↑, S / ↓", "Walk forward and back"], ["A / D", "Sidestep"], ["← / →", "Turn"], ["Shift (hold)", "Run"], ["Drag the mouse", "Look around; drag down to look up at the hanging signs and the roof"], ["M", "Big map of the whole hall; click a spot to walk there"], ["Rest the mouse on a cover or print (about 2 s)", "See it full size; a small bar shows the hold; move off to close"],
        ["E or Enter", "Open the booth you are at, or talk to ConBot when you are next to it"], ["C", "Sit on a theater bench, or at your own booth's chair"], ["V", "Switch between first and third person"], ["M", "Back to the map"],
        ["1 to 8", "Play an emote (wave, dance, cheer, clap, bow, point, laugh, facepalm)"], ["T (hold)", "Talk, when voice chat is on (see Voice chat)"], ["Enter", "Type in the chat box (computers); Esc goes back to walking"], ["Esc", "Close the open panel, or leave the chat box"],
      ] } },
      { h: "Phone", bullets: ["The joystick at the bottom right walks; push it to the rim to run.", "Drag anywhere else to look around.", "Cards appear at the bottom of the screen when you reach a booth, a seat, ConBot or a giveaway; tap them.", "The menu is at the bottom left so the right thumb keeps the stick."] },
      { h: "Map mode", bullets: ["Drag to orbit, scroll or pinch to zoom, WASD or arrows to pan.", "Click a booth to open its storefront; the Top booths and Live lists on the left jump to a booth."] },
      { h: "Links you can share", table: { head: ["Address", "Opens"], rows: [
        ["/app?booth=42", "The hall with booth 42 selected"], ["/app?booth=42&mode=walk", "Walks you to the booth"], ["/app?at=120,-40", "Puts you at a spot on the floor (people share this as \"meet me here\")"],
        ["/app?tour=headliners", "Starts a guided tour"], ["/app?claim=1", "The claim-a-booth flow"], ["/app?arcade=1", "The arcade panel"], ["/app?theater=1", "The theater, full screen, with the showtimes"], ["/app?conbot=1", "Calls ConBot over"], ["/app?night=1", "After-hours lighting"],
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
        "**On the table**: the comics standing on the table, or, when the exhibitor has switched the table to prints, framed pieces from their portfolio. Tap a cover for a full-size view; Buy opens the exhibitor's store. In the hall itself, rest the mouse on a cover, on a print on a stand or on a print on the wall for about two seconds (a small bar at the bottom shows the hold) and it opens full size over the hall; move the mouse away to close it. Prints that rotate through a portfolio hold still while you point at them.",
        "**Shop**: items the exhibitor sells, with prices. Opening one shows the picture, price and a Buy button; buying happens on the exhibitor's own site in a new tab, and the press counts for the booth.",
        "**Portfolio**: the artist's pieces. Every Artists' Alley table, and any booth switched to a print wall, hangs them as 11 × 17 prints on a free-standing black gridwall set in front of the drape and taller than it, from table height up (about 14 ft at a booth, half that in Artists' Alley), with the name strip along the top rail. A booth switched to prints flips through them on the table stands instead. Tap a piece for the full view, Buy a print where there is one, and Commission me to ask for a commission by email or on their site.",
        "**The portfolio book**: a print wall also lays one portfolio book, open and flat (24 × 18 in), on an otherwise bare table. Click the book in the hall, click any print on the wall, or press **Flip through the book** in the panel, and the book opens on screen: two pages per spread, **Next** / **Previous** or the ← → keys to turn, Buy a print under a page that has a print link, and Commission me. Click outside the book or press Esc to close it.",
        "**About**, **Signage** (their banner art), the numbers (value, rank, visits this week), and the ownership history.",
        "**Walk to the booth** switches to walk mode and takes you there. **☆ Save** keeps the booth in your saved list (Search → ★ Saved) so you can walk back to it any time; it is kept on your account when you are signed in, in this browser otherwise. **Share** opens the share card and buttons.",
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
      { h: "Claiming", steps: ["Click an open space on the map (grey, \"AVAILABLE\" sign on the floor), press Get a booth at the top left and pick one, or open Exhibitors (/app/directory): its Open spaces section lists every free space, grouped by type (islands, corner booths, 10×10 booths, Artist Alley tables) with hall, zone and price; click one to stand in front of it on the floor.", "Set it up in the designer: name, tagline, category, colours, banner style, table cloth. The floor previews it live.", "Pay by card through the checkout, or with credit, promo credit or a booth code. Your booth is live the moment payment lands.", "Open the dashboard (Manage this booth) to add your logo, art, links, comics, a shop and your portfolio."] },
      { h: "Value, takeovers and boosts", bullets: [
        "What you paid is your booth's **value**, and value is the rankings. Higher value brings bigger signage: a header banner, a hanging sign from the trusses, then a tower.",
        `Anyone can **take over** a booth for ${TAKEOVER_MULTIPLIER}× its value. The previous owner gets their full value back plus ${Math.round(SELLER_PREMIUM_SHARE * 100)}% of the premium as instant credit, and a notification. Value an owner got free (a code, converted coins, admin credit) is not paid out.`,
        "**Boost** your booth from the dashboard to raise both its value and the takeover price. Headliner booths get a 7-day shield after a claim or takeover.",
        "Every exhibitor booth has a 3×6 ft roll-up banner, which can be made taller, up to 8×16 ft, for $2 per foot, one-time; it counts toward value. An Artists' Alley table has no roll-up while its print wall is up (the default): the gridwall takes its place, with the artist's name on a strip along the top rail. Switch the table to Comic covers and a 3×6 roll-up stands behind it. A booth switched to Print wall puts its roll-up away the same way, and brings it back when the table is switched back.",
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
        ["Roll-up banner", "1:2 (1200×2400)", "The retractable banner behind an exhibitor's table (not shown with a print wall)"], ["Wide banner", "4:1 (2000×500)", "Back wall, header on posts, hanging sign"], ["Table drape", "3:1 (1800×600)", "The front of the table skirt, fitted and centred"],
        ["Comic cover", "2:3 (600×900)", "A stand on your table"], ["Tower wrap", "1:8 (300×2400)", "Islands: all four faces of the tower"], ["Floor graphic", "1:1 (2000×2000)", "Islands: the carpet"], ["Island roll-ups", "1:2", "Islands: one banner per side"],
        ["Portfolio piece", "11:17 (1100×1700)", "The print wall, the portfolio book, the table stands when a booth is switched to prints, and the gallery; older 4:5 uploads are cropped to fit"], ["Product photo", "1:1 (800×800)", "An item in your shop"],
      ] } },
      { p: "Uploads take PNG, JPG, WebP or a PDF (first page), up to 12 MB, and are cropped to the slot's ratio. Each slot's card says the physical size on the floor and what reads well from the aisle." },
      { h: "On the table", p: "An exhibitor booth shows comic covers on its stands by default. No books to show? The **On the table** card in the dashboard (above Books on display) has three other choices. **Print wall** stands a black gridwall across the back of the booth, in front of the drape and taller than it, with your portfolio clipped on as 11 × 17 prints from table height up to about 14 ft, and puts an open portfolio book on the table that visitors click to flip through on screen. The gridwall is the only thing on the back: the roll-up banner, the logo board and the back-wall banner are put away, your wide banner becomes the name strip along the top rail, and a hanging sign stays. (Island booths have no back wall, so they have no print wall.) **Art prints on the stands** puts framed pieces from your portfolio on the stands instead and flips through the set while someone is at your booth. **Off** leaves the table bare, with no stands at all. All of them are free, and a table shows one at a time, never a wall and stands together. Artists' Alley tables start with the print wall (half as tall) and the book; their card offers **Print wall** or **Comic covers**, and switching to covers takes the wall down and stands a 3×6 roll-up banner behind the table instead. Switch any time; your covers and pieces both stay, and the storefront lists them whatever the table shows." },
      { h: "Books on display", p: `Unlock a stand (${money(BOOK_PRICE_CENTS)} each), upload the front cover, and add a buy link under it. Visitors see the covers on your table and in the storefront, and Buy opens your store.` },
      { h: "Portfolio", p: `Up to ${GALLERY_LIMIT} pieces, 11 × 17, for every booth and table. On a print wall they hang in order from the bottom row up, left to right, as many as the wall holds (all 48 at a 10 ft booth, 15 at an Artists' Alley table); the book on the table and the storefront show every piece. A booth switched to prints flips through them on its stands. Add a link under a piece to sell it as a print: it becomes a Buy a print button under that page of the book and in the panel.` },
      { h: "Shop", p: `List up to ${PRODUCT_LIMIT} items with a name, price, a line about it, a square photo and the link to buy it on your own store (Shopify, Gumroad, your site). Visitors open the item inside the hall and buy on your page; every Buy press counts as a click from the source \"shop\", and the dashboard shows presses per item.` },
      { h: "Share your booth", p: "A card drawn from your banner art and logo, ready to post to X, Bluesky, Facebook or Reddit, copy for Discord, share from a phone with the card attached, or download. A caption is prepared for you. Each link is tagged so the referrer report shows what it brought." },
      { h: "Teams and managers", p: "Add people to a team so they can sit at your booth's chairs and be shown as crew. Friends from the floor can be added by name; anyone else by email. Tick **manager** next to a person and they can run the booth with you: edit the listing and links, upload art, stand comics, manage the portfolio and the shop, and read the numbers. Your booth then appears in their dashboard. Boosts, takeovers, plans, payouts, releasing the booth and the team itself stay with you; untick manager to take it back." },
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
        "The arcade machines cost 1 to 3 coins a round; the Hall Flyover drone ride costs 5; the slot machine takes bets of 1 to 25 coins a spin (see Arcade).",
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
      { h: "Lucky Longbox Slots (the casino corner)", bullets: [
        `A three-reel slot machine that bets your coins: open it from 🕹️ Arcade (Spin) or /app/arcade/slots, pick a bet of ${SLOT_BETS.join(", ")} coins and press Spin. The bet is taken when the reels start; a win is paid when they stop.`,
        `**Pay table** (times your bet): ${SLOT_SYMBOLS.map((s) => `three ${s.name.toLowerCase()}s ${s.triple}×`).join(", ")}; two sevens 5×, two gems 3×, two heroes 2×, one seven or any other pair gives the bet back.`,
        `The reels are drawn on the server, so the odds are exactly the pay table's: over many spins the machine pays back about ${Math.round(SLOT_RTP * 100)} coins per 100 bet and keeps the rest. Spins do not count for the daily arcade quest and never pay out as money; coins only ever buy things in the hall.`,
        "The page shows today's ten biggest single wins and your own spins, total bet and total won.",
      ] },
      { h: "Hall Flyover", p: "5 coins for a 60-second drone ride over every booth in the hall. Press the pad in the arcade or the button in the Arcade panel." },
      { h: "Theater", bullets: [
        "A film plays on the big screen in the arcade around the clock, the same moment for everyone. Walk up to hear it: tap the Now showing card (or click the screen) for sound; sound turns off when you leave the arcade.",
        "**Full screen**: press ⛶ Full screen on the Now showing card (or open /app?theater=1 from anywhere) to watch the same stream big, with sound, from wherever you are in the hall. ⛶ again uses your browser's real full screen. Back to the hall closes it.",
        "**Showtimes**: the full-screen view lists the programme: what is on now, what is next, and the next showings with their start time in UTC and in your own clock. The programme loops around the clock and everyone sees the same frame at the same moment, so agree on a time and meet there. **Invite someone** copies a line with the next showing's UTC time and a link that opens the theater.",
        "**Showcases**: each item is a movie, a cartoon, a live stream or other; the label shows next to it in the programme.",
        "Sit on a bench with C. Five minutes near the screen while a film plays completes a daily quest.",
        "The film is streamed in quality rungs that follow your connection. If your browser has no H.264 decoder (some Firefox installs), a WebM version plays instead.",
      ] },
    ],
  },
  {
    slug: "avatar", title: "Your avatar, emotes and the shop", icon: "🧑‍🎤", audience: "everyone",
    summary: "Making your avatar, emotes and reactions, and the shop's costumes, reaction packs and booth giveaways.",
    blocks: [
      { h: "Your avatar", p: "🧑‍🎤 on the rail: body type, skin tone, hair style and colour, shirt and pants, and cosplay presets (original looks, no trademarked characters). The two bodies are a man (6 ft) and a woman (5 ft 7 in), each with five hair styles of its own, or none: short, fringe, cropped, neat and curly for him; bob, long, side bob, ponytail and braid for her. The figures are realistic people in a T-shirt, jeans and trainers. They move the way people do because every movement is motion capture of a real person: the stroll, the brisk walk, the jog, standing, sitting and all eight emotes. Eyebrows take your hair colour. The look is saved on your device, and on your account when you are signed in, so it follows you. Your name and an optional job title (shown under the name) are set at the top of the panel and need an account. People far from you are drawn as simpler stand-ins to keep a crowded hall smooth; they turn into full figures as you get closer." },
      { h: "Your own model (VRM)", p: "Signed in, the avatar panel also takes a .vrm file of your own (VRoid Studio, Blender's VRM add-on, UniVRM; VRM 0.x or 1.0; up to 15 MB). Tick that the model is yours or licensed to you, pick the file, and you walk the floor in it with the same walk, run, sit and emotes as everyone else; the model's name, author and licence from its metadata are shown. Your body, colours and costume stay as your look for the far crowd and for anyone whose device cannot load the model. Take it off again with one button. Admins can remove a model from an account, and a show can switch own models off." },
      { h: "Emotes and reactions", p: "🙌 Emotes: eight emotes everyone nearby sees (also keys 1 to 8 while walking), and reactions that pop over your head. Moving cancels an emote." },
      { h: "The shop", bullets: [
        `🛍️ Shop on the rail. Costumes: ${ITEMS.filter((i) => i.kind === "costume").map((i) => `${i.name} (${i.coins})`).join(", ")} coins. Reaction packs: ${ITEMS.filter((i) => i.kind === "reactions").map((i) => `${i.name} (${i.coins})`).join(", ")} coins.`,
        "Some costumes carry a prop in the right hand that everyone sees: a glowing blade, a wand, a blaster with a proton-style pack on the back.",
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
        "**The chat box** (bottom left, on a computer): the chat stays open while you walk, in a small see-through box with three tabs. **Hall** is one room for everyone on the floor. **Friends** is a room only your friends see: what you post there reaches everyone on your friends list, and you see what they post (sign in to use it). **Whisper** is private messages: pick a person at the top of the tab, or press 💬 next to anyone in People. Press **Enter** anywhere to start typing, Enter to send, **Esc** to go back to walking; your walk keys are off while you type. ▾ shrinks the box to one line (new lines show as a count on the tab), ⤢ opens the same chat as a big panel, and Settings → Chat box turns it off. Phones use the 💬 and 👥 rail buttons instead.",
        "**Hall chat** (💬): the same hall room as a full panel; messages also appear as bubbles over heads. Signed-in visitors post; only exhibitors may post links. Mention someone with @handle to notify them.",
        "**People** (👥): everyone on the floor right now, with a Say hi (direct message) and a copy-my-spot link.",
        "**A person's card**: click anyone's avatar on the floor (or their name in People) to see who they are: name and title, whether they are live or away and how far from you, what costume and hair they wear, and for accounts their handle, how long they have been a member, their friends count and streak, the booth they exhibit at (with an Open booth button) and their best arcade scores. The card's buttons: Message, Go to them, Add friend (or accept their request), Block and Report.",
        "**Direct messages** stay between the two of you and work for guests on the floor as well as accounts; an account keeps them across devices.",
        "**Friends**: press ➕ next to a person in People (or on their card on the floor) to send a request; they accept it in their People panel. Friends show a toast when they arrive on the floor and can be added to your team.",
        "**Blocking** (🚫 next to a person in People, or Block at the top of a message thread): their chat and speech bubbles disappear for you, they can no longer message you or send you friend requests, and voice never connects to them. They are not told. Unblock any time from the Blocked list in People. Blocking needs a free account.",
        "**Reporting** (⚑): tell the admins about harassment, spam, impersonation or adult content. Pick a reason, add a line if you like, and the last things the person said go with it. You can block them at the same time.",
        "**Teams** (🎟️): an exhibitor's crew. Members can sit at the booth's chairs and are listed as staff; a member the owner marks as **manager** can also edit the booth from their own dashboard.",
        "**Voice chat**: optional push-to-talk with people within a few feet; see Voice chat.",
        "**Away**: switch tabs and you stay on the floor, marked away, for a couple of minutes.",
        "**Who else is around**: besides real visitors (green triangle over the head), the floor has a crowd of extras, ConBot the mascot, and one federal agent in a black suit, shades and an earpiece who walks the main cross aisle around the clock. Walk up to him and press E: he has a question for you. None of them are real people, and the agent's suit is not in the costume picker.",
      ] },
    ],
  },
  {
    slug: "tours", title: "Guided tours", icon: "🧭", audience: "visitors",
    summary: "Don't know where to start? Pick a tour and ConBot leads you around the hall, stop by stop, with a line on the floor showing the way.",
    blocks: [
      { steps: [
        "Open **Guided tours** with the compass button (🧭) in the side rail, or ask ConBot \"Show me around\". The list shows each tour with its stops: Headliners (the featured and biggest booths), New this week (the newest exhibitors), Artists' Alley (artist tables with a portfolio first), The arcade & theater, and one tour per category that has at least three booths. Each tour has up to six stops.",
        "Press **Start**. You switch to walking, the panel closes, and ConBot sets off for the first stop. An amber dashed line on the floor runs from you to the stop, and a glowing ring marks the spot to stand. Follow the line or follow ConBot.",
        "The bar at the bottom of the screen shows which stop you are on (\"Tour · stop 2 of 6 · name\"). Within about 12 ft of the stop the bar shows a line about it, and you can press **Open booth** to look at that exhibitor or **Next stop** to move on. Before you arrive the same button reads Skip.",
        "On the last stop, Next stop becomes **Finish**; press it to end the tour. **End** stops a tour at any point. While a tour runs the usual \"press E\" booth prompt gives way to the tour bar.",
      ] },
      { bullets: [
        "Share a tour with a link: add ?tour=headliners, ?tour=new, ?tour=artists, ?tour=arcade or ?tour=cat:comics (any category key) to the hall address. It opens in walking mode with the tour running; an unknown id opens the tours list.",
        "ConBot stays with you between stops; fall far behind and he waits and calls out. Tours are worked out from what is on the floor right now, so the stops change as booths are claimed.",
        "Switching to the map keeps the tour running; the line and ring are drawn there too.",
      ] },
    ],
  },
  {
    slug: "voice", title: "Voice chat (push to talk)", icon: "🎙️", audience: "everyone",
    summary: "Talk out loud to the people standing next to you on the floor. Off until you turn it on; push-to-talk only; nobody hears you unless you hold the key, and only people within a few feet.",
    blocks: [
      { h: "What it is", p: "Walk up to someone on the floor and you can talk to them, like leaning over to the next table at a convention. Voice is off by default. When it is on, the hall opens your microphone (muted) while you walk and connects you to the nearest few people within about 14 feet. The closer someone stands, the louder they are; past 14 feet you can't hear each other at all. Up to four people at a time, the nearest ones. Text chat and private messages work exactly as before, with or without voice." },
      { h: "Where to find it", p: "⚙️ Settings → Voice chat → \"Talk to people near you\". The choice is saved on this device. The first time you walk the floor with it on, the browser asks for permission to use your microphone. While you are walking with voice on, a microphone button appears: bottom right beside the mode buttons on a computer, bottom left beside the mode buttons on a phone." },
      { h: "How to use it", bullets: [
        "**Hold T** to talk, or press and hold the microphone button. Let go and you are muted again. There is no open mic.",
        "The microphone button lights up green while you are transmitting.",
        "The list next to the button shows who is in range: 🎧 connected, ⋯ still connecting, 🔊 next to whoever is talking. A 🔊 also shows over that person's head in the hall.",
        "Both of you need voice turned on. If someone near you has it off, they don't appear in your list.",
        "Leaving walk mode (back to the map) or turning the toggle off releases the microphone at once.",
      ] },
      { h: "Privacy", bullets: [
        "Push-to-talk only: nobody hears you unless you are holding T or the button.",
        "Only people within a few feet of your avatar can hear you, and only while they also have voice on.",
        "Audio goes directly between browsers (WebRTC, peer to peer). The server only passes the short connection handshake between two people standing near each other; it never receives, stores or records audio.",
        "Your microphone is open only while you are in walk mode with the toggle on, and muted unless you are holding the key.",
      ] },
      { h: "Limits and troubleshooting", bullets: [
        "Up to 4 people at once (the nearest), within about 14 feet; full volume up to 4 feet, fading to silence at 14.",
        "If the browser blocks the microphone, Settings shows the reason under the toggle. Browsers without WebRTC or microphone support say so; text chat still works.",
        "Voice needs a direct connection between the two browsers; on some very restrictive networks two people may not connect even when standing together. Text chat always works.",
      ] },
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
    summary: "Where the operator tools are, and where uploaded images are kept.",
    blocks: [
      { p: "/admin (superadmins, and staff with an area permission): booths (details, release, transfer, shield, feature, sponsored giveaways), users, transactions and payouts, codes, plans, billboards, the theater (films, encoding and downsampling), emails (compose, templates, inbox, logs), webhooks, errors, performance captures, the audit log and settings (site URL, payments, email, storage)." },
      { h: "Where uploads live", p: "Booth art (banners, covers, portfolio pieces, product photos) and logos are kept in the database until Cloudflare R2 is switched on under Admin → Settings → Storage: enter the account id, an R2 API token (access key id and secret) with read and write on the bucket, the bucket name and, ideally, the bucket's public URL (an r2.dev address or a connected custom domain, with a CORS rule allowing GET and HEAD from the site so the floor can use the images as textures). Press Test R2, then set R2_ENABLED to true: new uploads go straight to the bucket. Move existing uploads copies everything already in the database across in batches and can be repeated or interrupted safely. Visitors' links never change; the site redirects them to the bucket, or streams the file itself when no public URL is set or the public host is not answering yet (it checks every minute and switches to the direct link once the domain is live). Theater films stay on the server's disk." },
    ],
  },
];

export const docBySlug = (slug: string): DocSection | undefined => DOCS.find((d) => d.slug === slug);
/** Plain text of a section for search in the Help panel. */
export const docText = (d: DocSection): string => [d.title, d.summary, ...d.blocks.flatMap((b) => [b.h ?? "", b.p ?? "", ...(b.steps ?? []), ...(b.bullets ?? []), ...(b.table?.rows.flat() ?? []), b.tip ?? ""])].join(" ").toLowerCase();
