/**
 * Landing pages for the searches the site answers: what a virtual comic con is, the online artist alley, exhibiting,
 * and promoting an indie comic. Each one is its own page with its own copy and FAQ (rendered by app/[landing]), not a
 * reworded copy of the home page. Prices come from config so the copy can't drift from checkout.
 */
import { BOOTH_SIZES, TIERS, formatMoney, ZONES, TAKEOVER_MULTIPLIER, SELLER_PREMIUM_SHARE } from "@/lib/config";
import { GAMES } from "@/lib/arcade";

const price = (k: keyof typeof BOOTH_SIZES) => formatMoney(BOOTH_SIZES[k].priceCents);
const AA = price("6x10"), INLINE = price("10x10"), CORNER = price("20x10"), ISLAND = price("20x20");
const PRO = formatMoney(TIERS.pro.priceCents);
const GAME_COUNT = Object.keys(GAMES).length;
const PREMIUM = `${Math.round(SELLER_PREMIUM_SHARE * 100)}%`;
const MULT = `${TAKEOVER_MULTIPLIER}×`;

export interface LandingSection { h: string; p: string[]; bullets?: string[] }
export interface Landing {
  title: string;          // <title> (absolute, already includes the brand)
  description: string;    // meta description, ~150 characters
  eyebrow: string;
  h1: string;
  lead: string;
  image: { src: string; alt: string };
  sections: LandingSection[];
  faq: Array<[string, string]>;
  cta: { label: string; href: string };
  keywords: string[];
  related: string[];      // other landing slugs to link to
}

export const LANDINGS = {
  "virtual-comic-con": {
    title: "Virtual Comic Con: a 3D Online Comic Convention Open 24/7 | ForeverComicCon",
    description: "Walk a 3D virtual comic con in your browser, any time. Publisher islands, an artist alley, an arcade and a theater. Free to explore, no download, no badge line.",
    eyebrow: "Virtual comic con",
    h1: "A virtual comic con you can actually walk.",
    lead: "ForeverComicCon is an online comic convention built like the real thing: a 3D exhibit hall with aisles, booths, hanging signs, an artists' alley and an arcade in the middle of the floor. It runs in your browser, it never closes, and walking it is free.",
    image: { src: "/marketing/overview.jpg", alt: "Overhead view of the ForeverComicCon exhibit hall: rows of booths along blue aisles with the arcade in the middle" },
    sections: [
      {
        h: "What makes it a convention, not a website",
        p: ["Most \"virtual conventions\" are a grid of links. This one is a place. You pick an avatar and walk eight halls of pipe-and-drape booths, see who else is on the floor, and stop at whatever catches your eye, just like you would at a big show."],
        bullets: [
          "A real floor plan: Halls A to H, numbered booths, publisher islands, corner booths and an Artists' Alley.",
          "Every booth belongs to a real exhibitor: publishers, indie creators, comic shops, toy makers and fan projects.",
          "Click a banner and you're on the exhibitor's own site, store or Kickstarter.",
          `An arcade with ${GAME_COUNT} cabinet games, a theater screen and a mascot who answers questions.`,
          "Hall chat, friends, teams and emotes, so it feels busy because people are there.",
        ],
      },
      {
        h: "Open 24/7, from anywhere",
        p: [
          "There's no weekend to miss and no flight to book. The doors never close, so you can drop in on a lunch break, at 3 a.m., or from a country your favorite con has never visited.",
          "It works on a laptop, desktop or phone. No app, no download and no account needed to look around. Make a free account when you want an avatar that follows you, coins for the arcade, or a booth of your own.",
        ],
      },
      {
        h: "Every week is a new season",
        p: ["The trending board resets every Monday. The busiest booths of the week win arcade coins and a spot on the home page, and every exhibitor's rank is kept, so there's always something new on the floor."],
      },
      {
        h: "Exhibiting at the virtual comic con",
        p: [`Booths are permanent, numbered spaces on the floor plan: an Artist Alley table is ${AA}, a 10×10 inline booth starts at ${INLINE}, a corner at ${CORNER} and a 20×20 publisher island at ${ISLAND}. You set the banner, logo, colors and link, and you see exactly how many people walked past, stopped and clicked through.`],
      },
    ],
    faq: [
      ["What is a virtual comic con?", "A comic convention you attend online. ForeverComicCon is a 3D exhibit hall in your browser, laid out like a real con floor, where real publishers, artists and shops have booths that link to their own sites."],
      ["Is the virtual comic con free to attend?", "Yes. Walking the floor, the directory, the theater and browsing booths are free and don't need an account. A free account adds an avatar, friends and arcade coins."],
      ["When is the virtual comic con open?", "Always. The hall is open 24 hours a day, every day, with a new trending season every Monday."],
      ["Do I need to download anything?", "No. It runs in a modern web browser with WebGL on desktop, laptop or phone."],
      ["Who exhibits?", "Comic publishers, indie creators and webcomic artists, comic shops, toy and collectible makers, game studios and fan communities. The exhibitor directory lists every booth."],
    ],
    cta: { label: "Walk the floor, free", href: "/app?mode=walk" },
    keywords: ["virtual comic con", "online comic convention", "virtual comic convention", "comic con online", "3D comic convention", "virtual comic book convention"],
    related: ["artist-alley", "exhibit", "promote-your-comic"],
  },

  "artist-alley": {
    title: `Online Artist Alley: Comic Artist Tables from ${AA} | ForeverComicCon`,
    description: `Get a table in a 3D online artist alley that's open 24/7. Show your art, link your shop, Patreon or commissions page, and see who stops by. Tables from ${AA}.`,
    eyebrow: "Online artist alley",
    h1: "An artist alley table that never packs up.",
    lead: `The Artists' Alley is a row of tables at the east end of the ForeverComicCon floor, built for individual comic artists and illustrators. A table is ${AA}, it stays yours, and every visitor who walks the alley walks past your banner.`,
    image: { src: "/marketing/artist-alley.jpg", alt: "Artists' Alley tables with roll-up banners along the purple aisles of Hall G" },
    sections: [
      {
        h: "What you get at your table",
        p: ["Each table is a 6-foot space in the alley with your own roll-up banner, a backdrop and a spot to sit, just like a real con table, except it's open all day, every day."],
        bullets: [
          "Your name, logo, banner art and colors, editable any time and updated on the floor instantly.",
          "A link straight to your shop, Etsy, Patreon, Ko-fi, Linktree, commissions form or webcomic.",
          "A public table page with a share card for socials, plus an embed badge for your site.",
          "Real numbers: how many people saw your table, visited and clicked, and where they came from.",
        ],
      },
      {
        h: "Built for creators, priced like a con",
        p: [
          `A table is ${AA}. That's less than a print run of business cards and a fraction of what a weekend artist alley costs once you add travel and a hotel.`,
          `Want more? The Pro plan (${PRO}/month) adds a hanging aisle sign, premium banner styles, 90 days of analytics, a guestbook and a weekly report. It's optional.`,
        ],
      },
      {
        h: "Your table only gains value",
        p: [`Someone can take over a table by paying ${MULT} its value. When that happens you get your full value back plus ${PREMIUM} of the premium as credit, instantly, so you can grab another spot, move up to a booth, or keep the profit.`],
      },
      {
        h: "Meet readers, not an algorithm",
        p: ["Visitors walk past your table the way they would at a real show. They see your art first, then your name, then your link, and nobody has to follow you first to find you."],
      },
    ],
    faq: [
      ["What is an online artist alley?", "A section of a virtual convention set aside for individual artists. At ForeverComicCon it's a row of tables in a 3D exhibit hall that visitors walk through in their browser."],
      ["How much is an artist alley table?", `${AA} for a table. There's no commission on your sales: buyers click through to your own shop and pay you directly.`],
      ["Can I sell my art from my table?", "Your table links to wherever you sell: your store, Etsy, Gumroad, Patreon, a commissions form. Visitors click your banner and buy from you directly."],
      ["Can I change my table after I set it up?", "Yes. Name, art, logo, link, colors and description are free to edit any time."],
      ["Is it only for comic artists?", "Comic artists and illustrators are the core of the alley, but cosplayers, sculptors, zine makers and other creators are welcome too."],
    ],
    cta: { label: `Get a table for ${AA}`, href: "/app?claim=1" },
    keywords: ["online artist alley", "virtual artist alley", "artist alley table", "comic artist alley online", "sell comic art online", "artist alley application"],
    related: ["promote-your-comic", "virtual-comic-con", "exhibit"],
  },

  exhibit: {
    title: `Exhibit at a Virtual Comic Convention: Booths from ${INLINE} | ForeverComicCon`,
    description: `Put your comic publisher, shop or brand on a 3D virtual convention floor. Inline booths from ${INLINE}, publisher islands from ${ISLAND}, with real foot-traffic analytics.`,
    eyebrow: "Exhibit",
    h1: "A virtual convention booth that keeps working after the show.",
    lead: "Comic conventions are where readers discover publishers, but a booth costs thousands and lasts a weekend. A ForeverComicCon booth is a permanent space on a 3D convention floor that sends people to your site every day, and shows you exactly who stopped by.",
    image: { src: "/marketing/hero.jpg", alt: "Visitors walking the aisles of Hall D past rows of booths, with the arcade and its neon frame behind" },
    sections: [
      {
        h: "Booth sizes and prices",
        p: ["Every space is a numbered spot on the floor plan. Spaces near the entrance and around the arcade cost more because they get more foot traffic."],
        bullets: [
          `Artist Alley table: ${AA}. A 6-foot table for an individual creator.`,
          `10×10 inline booth: from ${INLINE}. The classic: back wall, side drapes, a table and a roll-up banner.`,
          `20×10 corner booth: from ${CORNER}. Double-wide with two open sides.`,
          `20×20 island: from ${ISLAND}. Open on all four sides with a tower sign. The big-publisher spot.`,
          `${ZONES.front.name} spaces cost ${ZONES.front.mult}× and ${ZONES.headliner.name} ${ZONES.headliner.mult}×, for the busiest aisles.`,
        ],
      },
      {
        h: "Analytics you'd never get from a real booth",
        p: ["At a physical con you guess how many people stopped. Here you know. Every booth gets impressions (people who walked past), unique visitors, clicks to your site, click-through rate and referrers, by day."],
      },
      {
        h: "Everything links back to you",
        p: ["Your banner, logo and booth page all point at your site, store, Kickstarter or newsletter. You also get a share card for social posts, an embed badge, and a spot in the exhibitor directory and rankings."],
        bullets: [
          "Hanging aisle banners and taller signage for more visibility (Pro).",
          "Comic covers displayed on your table, linking to where readers can buy them.",
          "Team seats so your staff can sit at your booth and talk to visitors.",
          "A guestbook and weekly email report (Pro).",
        ],
      },
      {
        h: "Takeovers nobody loses on",
        p: [`Any booth can be taken over for ${MULT} its value. If that happens you're refunded your full value plus ${PREMIUM} of the premium as credit, instantly. Your booth's value only goes up.`],
      },
    ],
    faq: [
      ["How much does a virtual convention booth cost?", `From ${AA} for an Artist Alley table and ${INLINE} for a 10×10 booth, up to ${ISLAND} for a 20×20 island. Busier zones cost more. The optional Pro plan is ${PRO}/month.`],
      ["How long does my booth last?", "It's permanent. Your booth stays on the floor plan until someone takes it over, and then you're paid back more than you put in."],
      ["What do visitors see?", "Your booth in 3D on the show floor (banner, logo, colors, covers on your table) plus a public booth page. Clicking your banner opens your website."],
      ["What analytics do I get?", "Impressions, unique visitors, clicks, click-through rate and referrers, by day. The free tier shows 7 days and Pro shows 90."],
      ["Can my team staff the booth?", "Yes. Add teammates by email or from your friends and they can sit at your booth's chairs and chat with visitors."],
    ],
    cta: { label: "Pick a space on the floor", href: "/app?claim=1" },
    keywords: ["virtual convention booth", "virtual exhibit hall", "comic convention booth", "exhibit at comic con", "comic publisher marketing", "virtual trade show booth"],
    related: ["virtual-comic-con", "promote-your-comic", "artist-alley"],
  },

  "promote-your-comic": {
    title: "Promote Your Indie Comic or Webcomic: Get Discovered | ForeverComicCon",
    description: `A permanent booth at a 3D virtual comic con puts your indie comic or webcomic in front of readers who came to browse. Banner, link and stats from ${AA}.`,
    eyebrow: "Indie comic promotion",
    h1: "Promote your indie comic where readers go to browse.",
    lead: "Social feeds reward whoever posts most. Conventions reward whoever's there. ForeverComicCon is a convention that's always on: readers walk the floor looking for something new, and a booth puts your book in their path.",
    image: { src: "/marketing/walk.jpg", alt: "A visitor's avatar walking an aisle of booths toward the theater screen and the arcade" },
    sections: [
      {
        h: "Why a booth beats another post",
        p: ["A post lasts a few hours. A booth sits on the floor plan every day, in an aisle people walk on purpose. Visitors here came to find comics, so every person who stops at your banner is already a reader."],
        bullets: [
          "Your cover art on a banner and on the table, where browsers see it first.",
          "One click to your webcomic, store, Kickstarter, Patreon or newsletter.",
          "A booth page with a share card, so every launch post links back to the same place.",
          "Rankings and weekly seasons that reward the booths readers actually visit.",
        ],
      },
      {
        h: "Know what's working",
        p: ["Every booth tracks impressions, visitors, clicks and referrers. Change your banner, tagline or link and you'll see whether more people stop and click, day by day. That's something you can't measure at a physical con table."],
      },
      {
        h: "Made for small budgets",
        p: [`Start with an Artist Alley table for ${AA} or a 10×10 booth from ${INLINE}. There are no ad auctions and no cost per click. If someone takes over your booth you're paid back with a profit, and you can move somewhere new.`],
      },
      {
        h: "Launching a Kickstarter?",
        p: ["Point your booth at the campaign page for the run, then switch it back to your store afterwards. Your booth's visitor numbers make it easy to see how much traffic the con sent."],
      },
    ],
    faq: [
      ["How do I promote my indie comic online?", "Be where readers browse. A booth at ForeverComicCon puts your cover and link in a 3D comic con hall that's open 24/7, and shows you how many people saw it and clicked."],
      ["Does this work for webcomics?", "Yes. Link your booth to your webcomic's site, Webtoon, Tapas or Patreon page. Many exhibitors are webcomic creators."],
      ["How much does it cost?", `${AA} for an Artist Alley table or from ${INLINE} for a booth. There are no ads to buy and no per-click fees.`],
      ["Will I see results?", "Your dashboard shows impressions, visitors, clicks, click-through rate and referrers by day, so you can see what your booth sends you and adjust it."],
    ],
    cta: { label: "Set up your booth", href: "/app?claim=1" },
    keywords: ["promote indie comics", "indie comic marketing", "webcomic promotion", "how to promote a comic", "comic book marketing", "get readers for my comic"],
    related: ["artist-alley", "exhibit", "virtual-comic-con"],
  },
} satisfies Record<string, Landing>;

export type LandingSlug = keyof typeof LANDINGS;
export const LANDING_LINKS: Array<[LandingSlug, string]> = [
  ["virtual-comic-con", "Virtual comic con"],
  ["artist-alley", "Online artist alley"],
  ["exhibit", "Exhibit"],
  ["promote-your-comic", "Promote your comic"],
];
