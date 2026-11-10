/**
 * Landing pages for the searches the site answers: what a virtual comic con is, the online artist alley, exhibiting,
 * and promoting an indie comic. Each one is its own page with its own copy and FAQ (rendered by app/[landing]), not a
 * reworded copy of the home page. Prices come from config so the copy can't drift from checkout.
 *
 * Every page is also a walkthrough: numbered steps written for someone who has never used the site, each with a real
 * screenshot from public/guides (captured from the app; regenerate them when a screen changes).
 */
import { BOOTH_SIZES, TIERS, formatMoney, ZONES, TAKEOVER_MULTIPLIER, SELLER_PREMIUM_SHARE, ART_SLOTS, GALLERY_LIMIT, PRODUCT_LIMIT, BOOK_PRICE_CENTS } from "@/lib/config";
import { GAMES } from "@/lib/arcade";

const price = (k: keyof typeof BOOTH_SIZES) => formatMoney(BOOTH_SIZES[k].priceCents);
const AA = price("6x10"), INLINE = price("10x10"), CORNER = price("20x10"), ISLAND = price("20x20");
const PRO = formatMoney(TIERS.pro.priceCents);
const BOOK = formatMoney(BOOK_PRICE_CENTS);
const GAME_COUNT = Object.keys(GAMES).length;
const PREMIUM = `${Math.round(SELLER_PREMIUM_SHARE * 100)}%`;
const MULT = `${TAKEOVER_MULTIPLIER}×`;
const px = (s: { width: number; height: number }) => `${s.width} × ${s.height}`;

export interface LandingSection { h: string; p: string[]; bullets?: string[] }
export interface LandingImage { src: string; alt: string; width: number; height: number; caption?: string }
/** One numbered step of the walkthrough: what to do, what you will see, and a screenshot of it. */
export interface LandingStep { h: string; p: string[]; bullets?: string[]; img?: LandingImage; tip?: string }
export interface Landing {
  title: string;          // <title> (absolute, already includes the brand)
  description: string;    // meta description, ~150 characters
  eyebrow: string;
  h1: string;
  lead: string;
  image: { src: string; alt: string };
  before: string[];       // what to have ready before starting the steps
  minutes: string;        // how long the walkthrough takes
  steps: LandingStep[];
  sections: LandingSection[];
  faq: Array<[string, string]>;
  cta: { label: string; href: string };
  keywords: string[];
  related: string[];      // other landing slugs to link to
}

/* ---------- screenshots (public/guides, sizes from the conversion) ---------- */
const SIZES: Record<string, [number, number]> = {
  home: [1280, 800], signin: [1280, 800], "hall-walk": [1280, 740], "booth-open": [1280, 740], help: [1280, 740], avatar: [1280, 740], tours: [1280, 740],
  search: [1280, 740], quests: [1280, 740], arcade: [1280, 740], "claim-list": [1280, 740], "claim-space": [1280, 740], designer: [1280, 740], "designer-pay": [1280, 672],
  "artist-table": [1280, 740], "storefront-portfolio": [1280, 740], lightbox: [1280, 740], "dashboard-top": [815, 820], "dash-edit": [784, 851], "dash-art": [784, 1465],
  "dash-table": [784, 262], "dash-books": [784, 701], "dash-shop": [784, 410], "dash-share": [784, 601], "dash-teams": [784, 479], "dash-plan": [384, 473], "dash-grow": [384, 413],
  "dash-portfolio": [784, 894], "dash-rollup": [384, 413],
};
const shot = (name: string, alt: string, caption?: string): LandingImage => ({ src: `/guides/${name}.jpg`, alt, width: SIZES[name][0], height: SIZES[name][1], caption });

/* ---------- steps shared by the exhibitor guides ---------- */
const STEP_OPEN: LandingStep = {
  h: "Open the site and press the yellow button",
  p: [
    "Go to forevercomiccon.com. The big yellow button under the headline says **Get a booth from $5**. Press it.",
    "The 3D hall opens in the same tab. The first time it loads you will see \"Opening the hall\" for a few seconds while the floor and the models download. Nothing to install.",
  ],
  img: shot("home", "The ForeverComicCon home page with the yellow Get a booth from $5 button under the headline", "The home page. The yellow button starts the claim."),
  tip: "You do not need an account to look around or to set up your booth. You are asked to sign in only at the very end, when it is time to pay.",
};
const stepPick = (what: string, which: string): LandingStep => ({
  h: "Pick a space",
  p: [
    `A panel called **Get a booth** opens on the left of the hall. At the top are four size buttons with prices. ${what}`,
    "Below the buttons is the floor plan: grey squares are open, coloured ones are taken, and the arcade is the pink block in the middle. Under the map is a list of open spaces with their booth number, size, zone and price.",
    `${which} Click the space you want.`,
  ],
  bullets: [
    `**AA table · from ${AA}**: a 6-foot Artists' Alley table at the east end. A gridwall of prints with your name across the top, a chair, and your portfolio on the wall and in a book on the table.`,
    `**10×10 · from ${INLINE}**: an inline booth with a back wall, side drapes, a table, four comic stands and a roll-up banner.`,
    `**20×10 · from ${CORNER}**: a corner booth, double wide with two tables and two open sides.`,
    `**20×20 · from ${ISLAND}**: an island, open on all four sides, with a tower sign and up to four tables.`,
    `Spaces in **${ZONES.front.name}** cost ${ZONES.front.mult}× and in **${ZONES.headliner.name}** (around the arcade) ${ZONES.headliner.mult}×. More people walk past them.`,
  ],
  img: shot("claim-list", "The Get a booth panel: four size buttons with prices, the floor plan, and a list of open spaces", "The Get a booth panel. Press a size, then click a space in the list or on the map."),
  tip: "You can also walk the floor and click any booth with an AVAILABLE sign on its table. Its card opens with the same Set up & claim button.",
});
const STEP_SPACE: LandingStep = {
  h: "Check the space, then press Set up & claim",
  p: [
    "The card for that space shows its price, what kind of booth it is and what comes with it: a permanent booth number, a banner with your logo, tagline and link, tracked visits and clicks, and a shareable card.",
    "Press the yellow **Set up & claim this space →** button.",
  ],
  img: shot("claim-space", "An open space's card showing the price, a description and the Set up & claim this space button", "An open 10×10 in Headliner Row. The yellow button starts the setup."),
};
const STEP_DESIGN: LandingStep = {
  h: "Fill in your name, link and look",
  p: [
    "The setup form opens where the card was. Everything you type shows up on the booth behind it straight away, so you can see what visitors will see.",
    "Fill in the boxes from the top down:",
  ],
  bullets: [
    "**Exhibitor name**: your studio, shop or publisher name. This goes on your banner and in the directory.",
    "**Tagline**: one line that goes on the banner under the name, such as \"Horror comics from Ohio\".",
    "**Website**: where people go when they click your banner. Your shop, Kickstarter, Patreon, Linktree or webcomic. Must start with https://.",
    "**Logo**: press **Upload** and pick a square PNG or JPG, or paste an image link. Until you do, your initials are used.",
    "**Banner colour** and **Accent**: tap a swatch. The banner, drapes and table cloth recolour as you tap.",
    "Further down: your social handles (Instagram, X, Facebook, ArtStation, DeviantArt, GlobalComix) and an **About** paragraph. All optional.",
  ],
  img: shot("designer", "The booth setup form on the left with a live 3D preview of the booth behind it", "Type a name and the banner behind the form changes as you type."),
  tip: "Every one of these can be changed later from your dashboard, for free, as often as you like. Do not agonise over it now.",
};
const STEP_PAY: LandingStep = {
  h: "Pay and go live",
  p: [
    "Scroll the form to the bottom. The price of the space and the total are shown. If someone gave you a booth code, press **Have a booth code?** and type it; the total drops to $0.",
    "Press **Continue to payment →**. If you are not signed in yet you are asked for an email and password first (your setup is kept). Then you are sent to the card checkout, which is run by DivinityCoin; we never see your card.",
    "When the payment lands you come back to the hall and your booth is on the floor with your name on it. You also get an email with a link to your dashboard.",
  ],
  img: shot("designer-pay", "The bottom of the setup form with the price, the booth code link, the total and the Continue to payment button", "The bottom of the form: the total and the Continue to payment button."),
  tip: "Changed your mind? A claim is refunded in full within 24 hours as long as nobody has clicked or taken over the booth yet. Rules & refunds in the footer has the details.",
};
const STEP_DASHBOARD: LandingStep = {
  h: "Open your dashboard",
  p: [
    "Press **Dashboard** in the bar at the bottom of the hall, or go to forevercomiccon.com/app/dashboard. Your booths are listed on the left; click one to work on it.",
    "The top of the page is your numbers: **Impressions** (people who walked past), **Unique visitors**, **Booth visits** (walked up or opened it), **Website clicks**, click-through rate and where the clicks came from. Switch between 7, 30 and 90 days with the buttons at the top right.",
    "Below the numbers are the cards that change your booth. Each one is described in the next steps.",
  ],
  img: shot("dashboard-top", "The dashboard for a booth: a checklist, the booth name, and eight number tiles for impressions, visitors, visits and clicks", "The top of a booth's dashboard. The checklist at the top walks you through the first things to do."),
};
const STEP_EDIT: LandingStep = {
  h: "Edit booth: name, links and colours",
  p: [
    "The **Edit booth** card holds what you typed at setup plus more: the website, six social links, tagline, description, logo, colours, banner style, table cloth colour and category.",
    "Change anything and press **Save**. The floor updates the moment you do, with no reload, for everyone in the hall.",
  ],
  img: shot("dash-edit", "The Edit booth card with name, website, social links, tagline, description, logo, colours and category", "Edit booth. Free, instant, as often as you like."),
};
const STEP_ART: LandingStep = {
  h: "Upload your banner art",
  p: [
    "The **Banner artwork** card has one box per place art can go on your booth. Each box says the size to upload, how big it is on the floor and what reads well from the aisle. Press **Upload** in a box, pick the file, and it is cropped to fit.",
    "Uploads take PNG, JPG, WebP or a PDF (first page), up to 12 MB.",
  ],
  bullets: [
    `**Roll-up banner** (${ART_SLOTS.portrait.ratio}, ${px(ART_SLOTS.portrait)} px): the tall retractable banner behind your table. The one everyone sees first.`,
    `**Wide banner** (${ART_SLOTS.wide.ratio}, ${px(ART_SLOTS.wide)} px): across your back wall, and on the header and hanging sign when you have them.`,
    `**Table drape** (${ART_SLOTS.drape.ratio}, ${px(ART_SLOTS.drape)} px): printed on the front of your table skirt.`,
    `Islands also get a **tower wrap**, a **floor graphic** and one roll-up per side.`,
  ],
  img: shot("dash-art", "The Banner artwork card: a box per art slot with the recommended size, a preview and an Upload button", "Banner artwork. Each box tells you the exact size to make."),
  tip: "No art yet? The booth draws a banner from your name, tagline, logo and colours, so it never looks empty. Replace it when you have something.",
};
const STEP_BOOKS: LandingStep = {
  h: "Stand your comics on the table",
  p: [
    `The **Books on display** card is your table's comic stands. Each stand costs ${BOOK} once. Press **Display a book** (pick how many stands you want), pay, then press **Upload cover** on a stand and pick the front cover (${ART_SLOTS.book.ratio}, ${px(ART_SLOTS.book)} px). Type where to buy it in the **Buy link** box under the cover and press **Save link**.`,
    "On the floor the cover stands on your table. Visitors tap it in your booth panel to see it full size, and the **Buy** button opens your link.",
  ],
  img: shot("dash-books", "The Books on display card: sixteen stands, four with covers and buy link boxes, the rest with Upload cover buttons", "Books on display. Four covers up, twelve stands waiting."),
  tip: "No comics to show? The **On the table** card just above lets you hang your portfolio on a print wall behind the table, put framed prints on the stands instead, or leave the table bare.",
};
const STEP_TABLE: LandingStep = {
  h: "Choose what the table shows",
  p: [
    "The **On the table** card has four choices. **Comic covers** is the default: the books you unlocked, one per stand. **Print wall** hangs your portfolio as 11 × 17 prints on a wall behind the table, from table height up to about 14 ft, and lays an open portfolio book on the table that visitors click to flip through (island booths have no back wall, so they skip this one). **Art prints on the stands** puts framed pieces from your portfolio on the stands instead and flips through them while someone is at the booth. **Off** leaves the table bare. All four are free.",
    "Pick one and it saves on its own. Nothing is deleted when you switch; your covers and pieces are kept.",
  ],
  img: shot("dash-table", "The On the table card with four choices: Comic covers, Print wall, Art prints on the stands, and Off", "On the table: covers, a print wall, prints on the stands, or nothing."),
};
const STEP_SHOP: LandingStep = {
  h: "Add a shop",
  p: [
    `The **Shop** card lists up to ${PRODUCT_LIMIT} items: a name, a price, one line about it, a square photo (${px(ART_SLOTS.product)} px) and the link to buy it on your own store (Shopify, Gumroad, Etsy, your site).`,
    "Visitors open the item inside the hall and press Buy, which opens your page. You keep every sale; there is no commission. The dashboard counts Buy presses per item.",
  ],
  img: shot("dash-shop", "The Shop card with an item listed and the form to add another", "The Shop card. Items are bought on your own store."),
};
const STEP_SHARE: LandingStep = {
  h: "Share your booth",
  p: [
    "The **Share your booth** card draws a card from your banner art and logo with your booth number on it. Press a button to post it to X, Bluesky, Facebook or Reddit, copy the link for Discord, or download the picture. A caption is written for you.",
    "Each link is tagged, so the **Where clicks come from** table on your dashboard shows what each post brought in.",
  ],
  img: shot("dash-share", "The Share your booth card: a preview of the share card, a caption, and buttons for X, Bluesky, Facebook, Reddit, copy and download", "Share your booth. One press per network."),
};
const STEP_TEAM: LandingStep = {
  h: "Let your team help",
  p: [
    "The **Teams** card lets you make a team and add people, by name if they are already your friend in the hall or by email if not. Team members can sit at your booth's chairs and show up as your crew.",
    "Tick **manager** next to a person and they can run the booth with you: edit the listing, upload art, stand comics, manage the shop, read the numbers. Money, plans and releasing the booth stay with you. Untick it to take it back.",
  ],
  img: shot("dash-teams", "The Teams card: a team with members, a manager tick box next to each, and boxes to add people by name or email", "Teams. Tick manager and that person can run the booth."),
};
const STEP_GROW: LandingStep = {
  h: "Grow it, or let it grow",
  p: [
    `**Grow** boosts your booth's value, which moves it up the rankings and the directory. Your booth can also be taken over by someone paying ${MULT} its value. If that happens you get your full value back plus ${PREMIUM} of the premium as credit, instantly, to spend on another space.`,
    `**Plan**: the optional Pro plan (${PRO} a month) adds a hanging aisle sign, premium banner styles, 90 days of numbers, a guestbook and a weekly email report. Cancel any time.`,
  ],
  img: shot("dash-grow", "The Grow card with boost amounts", "Grow: boost the booth's value."),
};

const STEP_NUMBERS: LandingStep = {
  h: "Watch what happens",
  p: [
    "Come back to the dashboard whenever you like. The number tiles and the two charts show, day by day, how many people walked past, how many stopped, how many clicked through, and which of your posts sent them.",
    "Change one thing at a time (a new banner, a new tagline, a different link) and watch the clicks the next week. That is something you can never measure at a real con table.",
  ],
  img: shot("dashboard-top", "The dashboard numbers: impressions, unique visitors, booth visits, website clicks, click-through rate, time at booth, and a bar chart by day", "The same dashboard a week later: the chart fills in day by day."),
};

const HELP_TIP = "Stuck at any point? Press the ❓ button at the bottom of the bar on the right of the hall. It opens the Help panel, which has every control and every feature. The same pages are at forevercomiccon.com/help.";

export const LANDINGS = {
  "virtual-comic-con": {
    title: "Virtual Comic Con: a 3D Online Comic Convention Open 24/7 | ForeverComicCon",
    description: "Walk a 3D virtual comic con in your browser, any time. Publisher islands, an artist alley, an arcade and a theater. Free to explore, no download, no badge line.",
    eyebrow: "Virtual comic con",
    h1: "A virtual comic con you can actually walk.",
    lead: "ForeverComicCon is an online comic convention built like the real thing: a 3D exhibit hall with aisles, booths, hanging signs, an artists' alley and an arcade in the middle of the floor. It runs in your browser, it never closes, and walking it is free. Here is exactly how to get in and get around, with pictures.",
    image: { src: "/marketing/overview.jpg", alt: "Overhead view of the ForeverComicCon exhibit hall: rows of booths along blue aisles with the arcade in the middle" },
    before: ["A computer, laptop, tablet or phone with an up-to-date browser (Chrome, Edge, Firefox or Safari).", "Nothing to install and no account needed. An account is free and only matters if you want to keep an avatar and coins."],
    minutes: "Five minutes to be walking the floor.",
    steps: [
      {
        h: "Open the site and press Walk the floor",
        p: [
          "Go to forevercomiccon.com. Under the headline are two buttons. Press the dark one, **Walk the floor · free**. (The yellow one is for people who want to buy a booth.)",
          "The hall opens in the same tab. The first time you will see \"Opening the hall\" for a few seconds while it downloads the floor and the models. After that it opens straight away.",
        ],
        img: shot("home", "The ForeverComicCon home page with the Walk the floor button under the headline", "The home page. Press Walk the floor."),
      },
      {
        h: "Walk around",
        p: [
          "You are standing in the hall as a little character (your avatar) and the camera is behind you. Move with the keyboard and look with the mouse:",
        ],
        bullets: [
          "**W** or **↑** walks forward, **S** or **↓** walks back, **A** and **D** step sideways, **←** and **→** turn.",
          "Hold **Shift** to run.",
          "Hold the left mouse button and drag to look around.",
          "On a phone: a joystick appears at the bottom right. Push it to walk, push it to the edge to run, and drag anywhere else on the screen to look.",
          "The small map at the bottom left shows where you are (the yellow dot) and where other people are. Press **M** to make it bigger.",
        ],
        img: shot("hall-walk", "The hall in walk mode: the avatar on the arcade floor, booths beyond, the map at the bottom left and the button bar on the right", "Walking the floor. Map bottom left, buttons on the right."),
        tip: "The faint line at the bottom of the screen always lists the keys. If you ever get lost, press the compass button (🧭) on the right and take a tour; it walks you there.",
      },
      {
        h: "Know what is on the screen",
        p: ["A few things sit over the view. From the top:"],
        bullets: [
          "**Top left**: the show's total sales and a yellow **Get a booth** button (for exhibitors).",
          "**Top middle**: how many people are on the floor and how many booths are taken. Under it, the week's headliner booths.",
          "**Right edge**: the button bar. From the top: rankings 🏆, search 🔍, hall chat 💬, people and messages 👥, the arcade 🕹️, daily quests 📜, the shop 🛍️, guided tours 🧭, hanging banners, teams, the map/walk switch, first person 👁, your avatar, emotes 🙌, night mode 🌙, settings ⚙️ and help ❓.",
          "**Bottom left**: the map.",
          "**Bottom bar**: Exhibitors (the directory), Rankings, Arcade, Help and your coin balance.",
        ],
        img: shot("help", "The Help panel open over the hall, listing every control and feature", "The Help panel (❓) explains every button on this screen."),
      },
      {
        h: "Visit a booth",
        p: [
          "Walk up to any booth. When you are close, a card appears at the bottom with the booth's name and **E**. Press **E** (or tap the card on a phone) and the booth's panel opens on the left.",
          "The panel shows the exhibitor's logo, name and tagline, a yellow **Website** button, the comics standing on their table under **On the table**, their **Portfolio** if they are an artist, and their **Shop**.",
        ],
        bullets: [
          "Press **Website** to open their site in a new tab. The hall stays open behind it.",
          "Tap a comic cover to see it big. If it has a **Buy** label, the button under it opens their store.",
          "On the floor itself, rest your mouse on a cover or a framed print for a couple of seconds and it opens full size. Move the mouse away to close it.",
          "Click a banner on the floor and the exhibitor's website opens, the same as the Website button.",
        ],
        img: shot("booth-open", "A booth's panel open on the left: logo, name, Website button and comic covers, with the 3D booth and its table of comics behind", "A booth panel. Covers on the table, Website button at the top."),
      },
      {
        h: "Find a particular booth",
        p: [
          "Press the search button (🔍) on the right and type part of a name, a booth number or a category. Click a result and press **Walk to the booth**: your avatar walks there by itself.",
          "The **Exhibitors** link in the bottom bar opens the full directory as a normal web page, with every booth by category.",
        ],
        img: shot("search", "The search panel open with results for a name and a Walk to the booth button", "Search. Click a result and the hall walks you there."),
      },
      {
        h: "Or let the show walk you",
        p: [
          "Press the compass (🧭) for **Guided tours**. Pick one: Headliners, New this week, Artists' Alley, the arcade and theater, or one per category. Your avatar follows a line on the floor from stop to stop, pausing at each booth. Press **Skip** to jump ahead or **End** to get off.",
        ],
        img: shot("tours", "The Guided tours panel listing tours with their stops", "Guided tours. Pick one and follow the line."),
      },
      {
        h: "Play the arcade and earn coins",
        p: [
          `The pink floor in the middle of the hall is the arcade: ${GAME_COUNT} cabinet games and a theater screen. Walk up to a cabinet and press **E** to play. Games cost a few coins each.`,
          "Coins are earned, not bought. You get some for signing up, for walking the floor, visiting booths, daily quests (📜 in the button bar) and finishing in the week's top rankings. ConBot, the pink robot mascot, answers questions if you walk up and say hi.",
        ],
        img: shot("quests", "The Daily quests panel listing today's quests and their coin rewards", "Daily quests. Each one pays coins when you finish it."),
      },
      {
        h: "Dress your avatar",
        p: [
          "Press the avatar button (🧑‍🎤) on the right. Pick a body, skin, hair, outfit colours and, if you like, a costume. The preview turns as you change things. Costumes marked 🔒 are bought with coins in the shop (🛍️), and some booths give one away free to anyone who walks up.",
        ],
        img: shot("avatar", "The Your avatar panel with a 3D preview and choices for body, skin, hair, outfit and costume", "Your avatar. Everyone on the floor sees what you pick."),
      },
      {
        h: "Make a free account to keep it",
        p: [
          "Without an account your avatar and coins live only in this browser. Press the **Sign in** button (➜) at the bottom of the button bar, or the account link at the top of the site, type an email address and a password, and press the button. That is the whole sign-up; you are signed in at once. We send one email with a **Confirm your email** button, and confirming lets people invite you to their team by email.",
          "With an account your avatar, coins, friends and quests follow you to any device, and you can send and receive messages in the hall.",
        ],
        img: shot("signin", "The sign in page with email and password boxes", "Sign in or create an account. Email and password, nothing else."),
        tip: HELP_TIP,
      },
    ],
    sections: [
      {
        h: "What makes it a convention, not a website",
        p: ["Most \"virtual conventions\" are a grid of links. This one is a place. You pick an avatar and walk eight halls of pipe-and-drape booths, see who else is on the floor, and stop at whatever catches your eye, just like you would at a big show."],
        bullets: [
          "A real floor plan: Halls A to H, numbered booths, publisher islands, corner booths, an Artists' Alley, a main boulevard with cut-through lanes, and directory kiosks that show you where you are.",
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
        p: [`Booths are permanent, numbered spaces on the floor plan: an Artist Alley table is ${AA}, a 10×10 inline booth starts at ${INLINE}, a corner at ${CORNER} and a 20×20 publisher island at ${ISLAND}. You set the banner, logo, colors and link, and you see exactly how many people walked past, stopped and clicked through. The Exhibit guide walks through it step by step.`],
      },
    ],
    faq: [
      ["What is a virtual comic con?", "A comic convention you attend online. ForeverComicCon is a 3D exhibit hall in your browser, laid out like a real con floor, where real publishers, artists and shops have booths that link to their own sites."],
      ["Is the virtual comic con free to attend?", "Yes. Walking the floor, the directory, the theater and browsing booths are free and don't need an account. A free account adds an avatar, friends and arcade coins."],
      ["When is the virtual comic con open?", "Always. The hall is open 24 hours a day, every day, with a new trending season every Monday."],
      ["Do I need to download anything?", "No. It runs in a modern web browser with WebGL on desktop, laptop or phone."],
      ["It runs slowly on my computer. What can I do?", "Open Settings (⚙️ in the button bar) and turn down the quality, or turn off shadows and the crowd. Laptops with two graphics chips sometimes use the weak one; the Settings panel explains how to switch."],
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
    lead: `The Artists' Alley is a row of tables at the east end of the ForeverComicCon floor, built for individual comic artists and illustrators. A table is ${AA}, it stays yours, and every visitor who walks the alley walks past your banner. Below is every step from the home page to a table with your art on it, with pictures of each screen.`,
    image: { src: "/marketing/artist-alley.jpg", alt: "Artists' Alley tables with roll-up banners along the purple aisles of Hall G" },
    before: [
      `An email address and a card for the ${AA}. (Or a booth code, if someone gave you one.)`,
      "The link where people can buy from you or commission you: your shop, Etsy, Ko-fi, Patreon, Linktree, a commissions form, anything.",
      `Your banner picture, tall: ${px(ART_SLOTS.portrait)} px works best. A logo helps but is not required.`,
      `Three to twelve finished pieces, each cropped to ${ART_SLOTS.gallery.ratio} (${px(ART_SLOTS.gallery)} px). You can add these later.`,
    ],
    minutes: "About ten minutes to claim the table. Another ten to hang your art.",
    steps: [
      STEP_OPEN,
      stepPick(`Press the first one, **AA table · from ${AA}**.`, "Artists' Alley tables are named AA-A01, AA-A02 and so on."),
      { ...STEP_SPACE, img: shot("claim-space", "An open space's card with its price and the Set up & claim this space button", "An open space's card. Press Set up & claim this space.") },
      {
        ...STEP_DESIGN,
        bullets: [
          "**Exhibitor name**: the name you sign your work with. It goes on the banner and in the directory.",
          "**Tagline**: one line under the name, such as \"Inks, washes and the odd dragon\".",
          "**Website**: where people go when they click your banner. Your shop, Ko-fi, Patreon, Linktree or commissions page. Must start with https://.",
          "**Logo**: press **Upload** and pick a square image, or paste an image link. Until you do, your initials are used.",
          "**Banner colour** and **Accent**: tap a swatch. The banner and the drape behind your table recolour as you tap.",
          "Further down: Instagram, X, ArtStation, DeviantArt and the rest (a handle is enough), and an **About** line.",
        ],
      },
      STEP_PAY,
      STEP_DASHBOARD,
      {
        ...STEP_EDIT,
        p: [
          "The **Edit booth** card holds what you typed at setup plus more. Artists get two extra boxes: **Commissions** (a link or an email address where people ask for commissions) and a **Commission note** such as \"Open for commissions from $40\". Fill them in and your table gets a **Commission me** button.",
          "Change anything and press **Save**. The floor updates the moment you do, for everyone in the hall.",
        ],
      },
      {
        h: "Put your name over the wall",
        p: [
          `Your name is drawn on a strip along the top rail of your print wall from the moment you claim the table, in your colours. To use your own art there instead, open the **Banner artwork** card and upload to the **Wide banner** box (${ART_SLOTS.wide.ratio}, ${px(ART_SLOTS.wide)} px); it is cropped to fit.`,
          "Uploads take PNG, JPG, WebP or a PDF (first page), up to 12 MB. Big shapes and your name read best; small text is unreadable from the aisle.",
        ],
        img: shot("dash-art", "The Banner artwork card with a box for each place art can go, each with its size and an Upload button", "Banner artwork. For a table, the Wide banner box is the name strip along the top of your gridwall."),
        tip: "No art yet? The strip shows your name, in your colours, until you replace it.",
      },
      {
        h: "Hang your portfolio",
        p: [
          `Scroll to the **Portfolio** card. Press **Upload** in the first empty frame and pick a piece (${ART_SLOTS.gallery.ratio}, ${px(ART_SLOTS.gallery)} px; a different shape is cropped to fit). Repeat for up to ${GALLERY_LIMIT} pieces. Each one is hung on the print wall behind your table (bottom row first, left to right) and put in the book on the table the moment it uploads.`,
          "Selling prints? Type the link to buy a print in the box under a piece and press save. That piece gets a **Buy a print** button.",
          "Rather show comics? The **On the table** card above switches the table to **Comic covers**: the wall comes down, comic stands go on the table and a 3 × 6 roll-up banner stands behind it. It is one or the other, never both.",
        ],
        img: shot("dash-portfolio", "The Portfolio card with uploaded pieces, an empty frame with an Upload button, and a print link box under each piece", `Portfolio. Up to ${GALLERY_LIMIT} pieces, a print link under each.`),
      },
      {
        h: "This is what visitors see",
        p: [
          "On the floor your pieces hang as 11 × 17 prints on a black gridwall that stands behind your table, taller than the drape, from table height up, with your name on a strip along the top rail. An open portfolio book lies on the table. Resting the mouse on a print for two seconds shows it full size; clicking a print or the book opens the book on screen, where visitors turn the pages with **Next** or the ← → keys. A card at the bottom says your name and **see the portfolio**.",
        ],
        img: shot("artist-table", "An Artists' Alley table seen from the aisle with a wall of 11 by 17 prints behind it, an open book on the table and a card reading see the portfolio", "Your table from the aisle. Click the book, or press E to open the portfolio."),
      },
      {
        h: "…and when they press E",
        p: [
          "Your table's panel opens with your name, your links, and the **Portfolio** grid. Tapping a piece opens it full size with arrows to the next one, a **Buy a print** button if you added a link, and **Commission me** if you set up commissions.",
        ],
        img: shot("lightbox", "A portfolio piece open full size over the hall with Buy a print and Commission me buttons", "A piece open full size, with Buy a print and Commission me."),
      },
      STEP_SHARE,
      STEP_NUMBERS,
      { ...STEP_GROW, h: "Later: grow it", tip: HELP_TIP },
    ],
    sections: [
      {
        h: "What you get at your table",
        p: ["Each table is a 6-foot space in the alley with a gridwall of prints standing behind it, your name across the top, a portfolio book on the table and a spot to sit, just like a real artist table, except it's open all day, every day."],
        bullets: [
          "Your name, logo, banner art and colors, editable any time and updated on the floor instantly.",
          "A link straight to your shop, Etsy, Patreon, Ko-fi, Linktree, commissions form or webcomic.",
          `A portfolio of up to ${GALLERY_LIMIT} pieces on your print wall, in the book on the table and in your gallery, with a print link and a Commission me button.`,
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
      ["Can I sell my art from my table?", "Your table links to wherever you sell: your store, Etsy, Gumroad, Patreon, a commissions form. Visitors click your banner and buy from you directly. Each portfolio piece can carry its own print link too."],
      ["What size should my pictures be?", `Banner ${px(ART_SLOTS.portrait)} px (tall). Portfolio pieces ${px(ART_SLOTS.gallery)} px (${ART_SLOTS.gallery.ratio}). Logo square. PNG, JPG, WebP or PDF, up to 12 MB each. Other sizes are cropped to fit.`],
      ["Can I change my table after I set it up?", "Yes. Name, art, logo, link, colors, description and portfolio are free to edit any time."],
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
    lead: "Comic conventions are where readers discover publishers, but a booth costs thousands and lasts a weekend. A ForeverComicCon booth is a permanent space on a 3D convention floor that sends people to your site every day, and shows you exactly who stopped by. This page walks through claiming one and setting it up, screen by screen.",
    image: { src: "/marketing/hero.jpg", alt: "Visitors walking the aisles of Hall D past rows of booths, with the arcade and its neon frame behind" },
    before: [
      `An email address and a card. A 10×10 booth is from ${INLINE}, a corner from ${CORNER}, an island from ${ISLAND}. (Or a booth code.)`,
      "The link your banner should open: your store, site, Kickstarter or newsletter.",
      `A square logo, a tall banner (${px(ART_SLOTS.portrait)} px) and a wide one (${px(ART_SLOTS.wide)} px). All can be added later.`,
      `Front covers of the comics you want on the table (${px(ART_SLOTS.book)} px each) and where each one is sold.`,
    ],
    minutes: "Ten minutes to claim. Half an hour to dress the booth fully.",
    steps: [
      STEP_OPEN,
      stepPick("Press the size you want.", "Booth numbers tell you the hall and aisle: booth 1725 is in Hall D on aisle 1700."),
      STEP_SPACE,
      STEP_DESIGN,
      STEP_PAY,
      STEP_DASHBOARD,
      STEP_EDIT,
      STEP_ART,
      STEP_BOOKS,
      STEP_TABLE,
      STEP_SHOP,
      {
        h: "This is what visitors see",
        p: [
          "On the floor your booth has your banner on the back wall, the roll-up behind the table, your logo on the board and your comics standing on the table. Walking up and pressing **E** opens your panel: logo, name, tagline, a yellow **Website** button, the comics under **On the table** (tap one to see it big, **Buy** opens your link) and your **Shop**.",
          "Clicking your banner on the floor opens your website in a new tab.",
        ],
        img: shot("booth-open", "A booth's panel open on the left with the Website button and comic covers, and the 3D booth with comics on its table behind", "Your booth as a visitor sees it."),
      },
      STEP_TEAM,
      STEP_SHARE,
      STEP_GROW,
      { ...STEP_NUMBERS, tip: HELP_TIP },
    ],
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
          `Comic covers displayed on your table, linking to where readers can buy them (${BOOK} a stand).`,
          `A shop of up to ${PRODUCT_LIMIT} items, bought on your own store with no commission.`,
          "Team seats so your staff can sit at your booth and talk to visitors, and managers who can run it with you.",
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
      ["What size should my pictures be?", `Roll-up banner ${px(ART_SLOTS.portrait)} px, wide banner ${px(ART_SLOTS.wide)} px, table drape ${px(ART_SLOTS.drape)} px, comic covers ${px(ART_SLOTS.book)} px, product photos ${px(ART_SLOTS.product)} px, logo square. PNG, JPG, WebP or PDF, up to 12 MB. Each box in the dashboard repeats its size.`],
      ["What analytics do I get?", "Impressions, unique visitors, clicks, click-through rate and referrers, by day. The free tier shows 30 days and Pro shows 90."],
      ["Can my team staff the booth?", "Yes. Add teammates by email or from your friends and they can sit at your booth's chairs and chat with visitors. Tick manager and they can edit the booth too."],
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
    lead: "Social feeds reward whoever posts most. Conventions reward whoever's there. ForeverComicCon is a convention that's always on: readers walk the floor looking for something new, and a booth puts your book in their path. Here is the whole thing, from nothing to a booth with your cover on the table and a link to your campaign, with a picture of every screen.",
    image: { src: "/marketing/walk.jpg", alt: "A visitor's avatar walking an aisle of booths toward the theater screen and the arcade" },
    before: [
      `An email address and a card. A table is ${AA}, a 10×10 booth from ${INLINE}. (Or a booth code.)`,
      "The one link you want readers to hit: your Kickstarter, Webtoon, Tapas, Patreon, store or newsletter.",
      `Your cover as a picture, ${px(ART_SLOTS.book)} px, and a tall version of your key art for the banner (${px(ART_SLOTS.portrait)} px).`,
    ],
    minutes: "Fifteen minutes, start to finish.",
    steps: [
      STEP_OPEN,
      stepPick(`An Artists' Alley table (${AA}) is the cheapest way in. A 10×10 booth (from ${INLINE}) gets a back wall, a wide banner and four comic stands.`, "Pick whichever you can afford; you can move up later and your value comes with you."),
      STEP_SPACE,
      {
        ...STEP_DESIGN,
        h: "Name it, point it at your campaign, colour it",
        bullets: [
          "**Exhibitor name**: your comic's title or your studio name. Readers search by this.",
          "**Tagline**: the one line that sells the book. \"A heist comic set in a flooded Venice\" beats \"My new comic\".",
          "**Website**: the one link. During a Kickstarter, the campaign page. After it, your store or webcomic. Must start with https://.",
          "**Logo**: your title treatment or a character headshot, square.",
          "**Banner colour** and **Accent**: match your cover so the booth reads as the book from across the aisle.",
        ],
      },
      STEP_PAY,
      STEP_DASHBOARD,
      {
        ...STEP_ART,
        h: "Put your key art on the banner",
        p: [
          `In the **Banner artwork** card, upload your key art to the **Roll-up banner** box (${px(ART_SLOTS.portrait)} px, tall) and, if you have a booth, a wide version to the **Wide banner** box (${px(ART_SLOTS.wide)} px). Press **Upload**, pick the file, done.`,
          "This is what people see from the aisle before they see anything else, so use the art that makes people stop, not the logo.",
        ],
      },
      {
        ...STEP_BOOKS,
        h: "Stand your cover on the table with a buy link",
        p: [
          `In **Books on display**, press **Display a book** to unlock a stand (${BOOK}, once), then press **Upload cover** on it and pick your front cover (${px(ART_SLOTS.book)} px). Paste the link to buy it in the **Buy link** box under the cover and press **Save link**.`,
          "Now the cover stands on your table in 3D. Anyone who taps it in your booth panel sees it full size, and the **Buy** button under it opens your link. Resting the mouse on it on the floor opens it full size too.",
        ],
      },
      {
        ...STEP_SHARE,
        h: "Post the share card",
        p: [
          "In **Share your booth**, press the button for each network you use. The card is drawn from your banner art and the caption is written for you. Every link is tagged, so next week the **Where clicks come from** table tells you whether X, Bluesky, Reddit or Discord sent the readers.",
          "Use the same booth link in your bio and your newsletter. It is one page that never changes.",
        ],
      },
      {
        ...STEP_NUMBERS,
        h: "Read the numbers and adjust",
        p: [
          "The dashboard shows, day by day, how many people walked past your booth, how many stopped, how many clicked through and from where. Try a different tagline for a week. Swap the banner art. Watch the click-through rate move. Keep what works.",
        ],
      },
      {
        h: "Launching a Kickstarter? Swap the link, then swap it back",
        p: [
          "On launch day open **Edit booth**, change **Website** to the campaign page and press **Save**. Every banner click and every Buy press on your cover now goes to the campaign. When it ends, change it back to your store. The dashboard shows exactly how many people the con sent to the campaign.",
        ],
        img: shot("dash-edit", "The Edit booth card with the Website box", "Edit booth: change the Website box and press Save. Instant."),
        tip: HELP_TIP,
      },
    ],
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
    ],
    faq: [
      ["How do I promote my indie comic online?", "Be where readers browse. A booth at ForeverComicCon puts your cover and link in a 3D comic con hall that's open 24/7, and shows you how many people saw it and clicked."],
      ["Does this work for webcomics?", "Yes. Link your booth to your webcomic's site, Webtoon, Tapas or Patreon page. Many exhibitors are webcomic creators."],
      ["How much does it cost?", `${AA} for an Artist Alley table or from ${INLINE} for a booth, plus ${BOOK} per comic stand if you want covers on the table. There are no ads to buy and no per-click fees.`],
      ["Will I see results?", "Your dashboard shows impressions, visitors, clicks, click-through rate and referrers by day, so you can see what your booth sends you and adjust it."],
      ["I only have a cover and a link. Is that enough?", "Yes. Name, tagline, link and one cover make a complete booth. Everything else can be added whenever you have it."],
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
