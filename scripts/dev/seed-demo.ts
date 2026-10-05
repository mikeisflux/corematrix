/**
 * LOCAL DEVELOPMENT ONLY. Fills a local database with a fictional show floor so the
 * 3D scene and dashboards have something to render while you work. Never run this
 * against a production database: the site launches with an empty hall on purpose.
 *
 * Seeds a fictional show floor: ~260 exhibitors and artists across the
 * halls, 30 days of metrics, a sales history and an activity feed. Run: npx tsx scripts/dev/seed-demo.ts [--force]
 * Idempotent-ish: skips if booths already exist unless --force.
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { db, ensureMigrated, schema } from "../../src/lib/db";
import { claimPriceCents, spaceColumns } from "../../src/lib/economy";
import { newCode, newId, seeded, dayKey } from "../../src/lib/util";
import { splitTakeover, BANNER_STYLES } from "../../src/lib/config";
import { hallLayout, boothSpace } from "../../src/lib/hall/layout";
import { closeSeason } from "../../src/lib/seasons";
import { weekBounds } from "../../src/lib/util";

const force = process.argv.includes("--force");

const NAMES: Array<[string, string, string, string]> = [
  // name, tagline, category, website — all fictional; the demo floor never names real companies or people
  ["Meridian Comics", "Heroes for a new century", "comics", "meridiancomics.example"],
  ["Nightfall Press", "Crime, noir and the occasional ghost", "comics", "nightfallpress.example"],
  ["Paper Rocket", "Creator-owned since 2014", "comics", "paperrocket.example"],
  ["Ironwood Books", "The best in illustrated storytelling", "comics", "ironwoodbooks.example"],
  ["Tidal Wave Comics", "Sea monsters, every Wednesday", "comics", "tidalwavecomics.example"],
  ["Lantern Hill", "Something, something, something comics", "comics", "lanternhill.example"],
  ["Quarter Moon", "Slice-of-life, one slice at a time", "comics", "quartermoon.example"],
  ["Gutterworks", "Publisher of the world's strangest cartoonists", "comics", "gutterworks.example"],
  ["Kaboom Toys", "Fan-first exclusives", "toys", "kaboomtoys.example"],
  ["Pop Shelf", "Vinyl figures of everyone", "toys", "popshelf.example"],
  ["Forge & Form", "Masters of the resin statue", "toys", "forgeandform.example"],
  ["Sixth Scale Co.", "1/6 scale perfection", "toys", "sixthscale.example"],
  ["Retro Reaction", "Carded figures like it's 1984", "toys", "retroreaction.example"],
  ["Model Depot", "Kits, decals and airbrush supplies", "toys", "modeldepot.example"],
  ["Spellbound Games", "The card game with a thousand decks", "games", "spellboundgames.example"],
  ["Pixel Harbor", "Indie games, played here first", "games", "pixelharbor.example"],
  ["Dungeon Door", "Tabletop RPGs and dice by the pound", "games", "dungeondoor.example"],
  ["Deckbuilders Guild", "Trade, sleeve, shuffle", "games", "deckbuilders.example"],
  ["Nightstream", "Streaming the shows comics became", "media", "nightstream.example"],
  ["Late Night Toons", "Cartoons for grown-ups", "media", "latenighttoons.example"],
  ["Nerd Signal", "Podcasts, news, nerds", "media", "nerdsignal.example"],
  ["Starfall Studios", "A galaxy of our own", "media", "starfallstudios.example"],
  ["Titan Pictures", "Monsters, mostly", "media", "titanpictures.example"],
  ["Loot Vault", "Monthly fandom boxes", "retail", "lootvault.example"],
  ["Mile Long Comics", "The biggest back-issue dealer", "retail", "milelongcomics.example"],
  ["Ink & Thread", "Tees since 1982", "retail", "inkandthread.example"],
  ["Lunchbox", "Give back, geek out", "retail", "lunchbox.example"],
  ["Collectors' Crate", "Collectibles delivered", "retail", "collectorscrate.example"],
  ["Creators Relief Fund", "Helping comic creators in need", "fan", "creatorsrelief.example"],
  ["The 404th Legion", "Bad guys doing good", "fan", "404thlegion.example"],
  ["Cosplay Central", "Builds, foam, LEDs", "fan", "cosplaycentral.example"],
  ["Golden Age Pavilion", "Pre-code and pedigree books", "retail", "goldenagepavilion.example"],
  ["Freedom to Read Fund", "Protecting the freedom to read", "fan", "freedomtoread.example"],
  ["Ava Okafor", "Sketch covers and sticker sheets", "art", "avaokafor.example"],
  ["Kenji Tanaka", "Space opera, in ink", "art", "kenjitanaka.example"],
  ["Mara Lindqvist", "Character designer", "art", "maralindqvist.example"],
  ["Theo Reyes", "Demon-haunted watercolor", "art", "theoreyes.example"],
  ["Yuki Haddad", "Prints & lithographs", "art", "yukihaddad.example"],
  ["Poster Moon", "Posters, vinyl, collectibles", "art", "postermoon.example"],
  ["Scrollcomics", "Vertical scroll comics", "comics", "scrollcomics.example"],
  ["Tapestry", "Comics and novels", "comics", "tapestry.example"],
  ["Launchpad Comics", "Crowdfund your book", "comics", "launchpadcomics.example"],
  ["Keystone Auctions", "Key issues, graded", "retail", "keystoneauctions.example"],
  ["Slab Lab", "Comics grading", "retail", "slablab.example"],
  ["Prop Shop", "Props and miniatures", "toys", "propshop.example"],
  ["Crystal Quest", "Fantasy RPGs since forever", "games", "crystalquest.example"],
  ["Street Brawler", "Fighting games, arcade exclusives", "games", "streetbrawler.example"],
  ["Crown Comics", "Time travel, blade runners", "comics", "crowncomics.example"],
  ["Riverside Comics", "Small-town teens since 1941", "comics", "riversidecomics.example"],
  ["Harbor Comics", "Graphic novels for every shelf", "comics", "harborcomics.example"],
];

const ADJ = ["Ink", "Panel", "Gutter", "Splash", "Vortex", "Neon", "Retro", "Moon", "Lunar", "Pulp", "Crimson", "Hero", "Rogue", "Cosmic", "Shadow", "Pixel", "Atomic", "Vinyl", "Onyx", "Ember"];
const NOUN = ["Press", "Studio", "Comics", "Collective", "Illustration", "Prints", "Zines", "Toys", "Games", "Guild", "Forge", "Foundry", "Workshop", "Art", "Club", "Gallery", "Lab", "Co.", "Books", "Tales"];
const STYLES = BANNER_STYLES;
const CLOTHS = ["#111827", "#7f1d1d", "#1e3a8a", "#065f46", "#4c1d95", "#9a3412", "#3f3f46"];
const PALETTE = ["#e63946", "#f4a261", "#2a9d8f", "#264653", "#e9c46a", "#8338ec", "#3a86ff", "#ff006e", "#fb5607", "#06d6a0", "#118ab2", "#ef476f", "#ffd166", "#073b4c", "#9b5de5", "#00bbf9", "#00f5d4", "#f15bb5", "#fee440", "#1b998b", "#2d3142", "#4f5d75", "#bfc0c0", "#ef8354", "#5c4b51", "#8cbeb2", "#f2ebbf", "#f3b562", "#f06060"];

async function main() {
  await ensureMigrated();
  const existing = await db.select({ c: sql<number>`count(*)` }).from(schema.booths);
  if (Number(existing[0]?.c ?? 0) > 0 && !force) {
    console.log("Booths exist; pass --force to reseed.");
    return;
  }
  if (force) {
    for (const t of [schema.booths, schema.users, schema.sessions, schema.transactions, schema.events, schema.boothDaily, schema.boothReferrers, schema.visitorSeen, schema.siteDaily, schema.messages, schema.notifications, schema.billboards, schema.seasons, schema.coinLedger, schema.gameScores, schema.gamePlays]) {
      await db.delete(t);
    }
  }

  const rnd = seeded(20261002);
  const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
  const DAY = 86_400_000;
  const nowTs = Date.now();

  // Owners
  const owners: string[] = [];
  for (let i = 0; i < 90; i++) {
    const id = newId();
    owners.push(id);
    await db.insert(schema.users).values({
      id,
      email: `owner${i + 1}@example.com`,
      displayName: `owner${i + 1}`,
      referralCode: newCode(),
      creditCents: Math.floor(rnd() * 3000),
      createdAt: nowTs - Math.floor(rnd() * 60) * DAY,
    });
  }

  // Which spaces are claimed: islands and headliner row almost full, front of house busy, standard aisles patchy, artists' alley lively
  const claimed: number[] = [];
  for (const b of hallLayout()) {
    const dense = b.size === "20x20" ? 0.9 : b.zone === "headliner" ? 0.7 : b.zone === "front" ? 0.55 : b.kind === "artist" ? 0.35 : 0.12;
    if (rnd() < dense) claimed.push(b.id);
  }
  const bigNames = NAMES.slice(0, 29); // publishers, toys, games, media go on islands and headliner row first
  const artistNames = NAMES.filter((n) => n[2] === "art");

  let nameIdx = 0;
  const feed: Array<typeof schema.events.$inferInsert> = [];
  let salesTotal = 0;

  for (const boothId of claimed) {
    const space = boothSpace(boothId)!;
    let name: string, tagline: string, category: string, website: string;
    const big = space.size === "20x20" || space.zone === "headliner";
    if (big && nameIdx < bigNames.length) {
      [name, tagline, category, website] = bigNames[nameIdx++];
    } else if (space.kind === "artist" && artistNames.length && rnd() < 0.4) {
      [name, tagline, category, website] = artistNames.shift()!;
    } else if (!big && nameIdx >= bigNames.length && nameIdx < NAMES.length && space.kind !== "artist") {
      [name, tagline, category, website] = NAMES[nameIdx++];
    } else {
      name = space.kind === "artist" ? `${pick(["Ava", "Kenji", "Mara", "Theo", "Yuki", "Dev", "Rosa", "Finn", "Ines", "Jules", "Nico", "Sage"])} ${pick(["Okafor", "Tanaka", "Reyes", "Lindqvist", "Patel", "Novak", "Haddad", "Moreau", "Kim", "Silva", "Brandt", "Ortiz"])}` : `${pick(ADJ)} ${pick(NOUN)}`;
      tagline = space.kind === "artist" ? pick(["Prints, commissions, sketch covers", "Original art & zines", "Webcomic artist", "Character designer", "Watercolor & ink", "Sticker club"]) : pick(["New issue every month", "Est. 2019", "Indie books, big ideas", "Variant covers here", "Exclusives all weekend", "Signing at 2pm", "Built different", "Ask us anything"]);
      category = space.kind === "artist" ? "art" : pick(["comics", "comics", "toys", "games", "retail", "fan", "media"]);
      website = `${name.toLowerCase().replace(/[^a-z]+/g, "")}.example`;
    }
    const owner = pick(owners);
    const claimedAt = nowTs - Math.floor(rnd() * 55 + 2) * DAY;
    const basePrice = claimPriceCents(boothId);
    let value = basePrice;
    let salesCount = 1;
    const txs: Array<typeof schema.transactions.$inferInsert> = [];
    txs.push({ id: newId(), boothId, kind: "claim", buyerId: owner, amountCents: basePrice, platformCents: basePrice, valueBefore: 0, valueAfter: basePrice, status: "paid", provider: "sandbox", createdAt: claimedAt, paidAt: claimedAt });
    salesTotal += basePrice;
    // Takeovers / boosts: popular low booths have a history
    const rounds = big ? Math.floor(rnd() * 6) : space.zone === "front" ? Math.floor(rnd() * 3) : rnd() < 0.2 ? 1 : 0;
    let t = claimedAt;
    let currentOwner = owner;
    for (let r = 0; r < rounds; r++) {
      t += Math.floor(rnd() * 6 + 1) * DAY + Math.floor(rnd() * 20) * 3600_000;
      if (t > nowTs - 2 * 3600_000) break;
      if (rnd() < 0.5) {
        const { price, sellerPayout, platform } = splitTakeover(value);
        const buyer = pick(owners);
        txs.push({ id: newId(), boothId, kind: "takeover", buyerId: buyer, sellerId: currentOwner, amountCents: price, sellerPayoutCents: sellerPayout, platformCents: platform, valueBefore: value, valueAfter: price, status: "paid", provider: "sandbox", createdAt: t, paidAt: t });
        salesTotal += price;
        value = price;
        currentOwner = buyer;
        salesCount++;
        feed.push({ id: newId(), type: "takeover", boothId, title: `${name} took over booth ${space.label}`, detail: `Bought for $${(price / 100).toFixed(0)}`, amountCents: price, createdAt: t });
      } else {
        const amt = Math.round((rnd() * 4000 + 500) / 100) * 100;
        txs.push({ id: newId(), boothId, kind: "boost", buyerId: currentOwner, amountCents: amt, platformCents: amt, valueBefore: value, valueAfter: value + amt, status: "paid", provider: "sandbox", createdAt: t, paidAt: t });
        salesTotal += amt;
        value += amt;
        feed.push({ id: newId(), type: "boost", boothId, title: `${name} upgraded its signage`, detail: `+$${(amt / 100).toFixed(0)} in value`, amountCents: amt, createdAt: t });
      }
    }
    const tier = value > 30000 && rnd() < 0.5 ? "landmark" : value > 8000 && rnd() < 0.5 ? "pro" : "free";
    const color = pick(PALETTE);
    await db.insert(schema.booths).values({
      id: boothId,
      ownerId: currentOwner,
      name,
      tagline,
      description: rnd() < 0.5 ? `${name} — ${tagline}. Find us at ${space.kind === "artist" ? "table" : "booth"} ${space.label} in Hall ${space.hall}.` : null,
      website: `https://${website}`,
      logoUrl: null,
      color,
      accent: "#ffffff",
      ...spaceColumns(boothId),
      style: pick(STYLES),
      cloth: pick(CLOTHS),
      category,
      tier,
      tierUntil: tier !== "free" ? nowTs + 20 * DAY : null,
      subscriptionId: tier !== "free" ? `sandbox:${newId()}` : null,
      subscriptionStatus: tier !== "free" ? (rnd() < 0.85 ? "active" : "canceling") : null,
      valueCents: value,
      claimedAt,
      updatedAt: t,
      lastSoldAt: t,
      salesCount,
      totalViews: 0,
      totalClicks: 0,
      totalImpressions: 0,
    });
    await db.insert(schema.transactions).values(txs);
    feed.push({ id: newId(), type: "claim", boothId, title: `${name} is on the show floor`, detail: `Booth ${space.label} · Hall ${space.hall}`, amountCents: basePrice, createdAt: claimedAt });

    // 30 days of metrics; traffic scales with value and recency
    const pop = Math.log2(value / 100 + 2) * (big ? 2.2 : 1);
    let tv = 0, tc = 0, ti = 0;
    for (let d = 29; d >= 0; d--) {
      const ts = nowTs - d * DAY;
      if (ts < claimedAt) continue;
      const wk = new Date(ts).getUTCDay();
      const mult = wk === 0 || wk === 6 ? 0.7 : 1;
      const impressions = Math.floor((rnd() * 60 + 40) * pop * mult);
      const hovers = Math.floor(impressions * (0.08 + rnd() * 0.1));
      const views = Math.floor(hovers * (0.35 + rnd() * 0.4)) + Math.floor(rnd() * 3);
      const clicks = Math.floor(views * (0.12 + rnd() * 0.25));
      const uniques = Math.floor(impressions * 0.7);
      tv += views; tc += clicks; ti += impressions;
      await db.insert(schema.boothDaily).values({ boothId, day: dayKey(ts), impressions, hovers, views, clicks, uniques });
    }
    await db.update(schema.booths).set({ totalViews: tv, totalClicks: tc, totalImpressions: ti }).where(sql`id = ${boothId}`);
    const sources: Array<[string, number]> = [["map", 0.3], ["banner", 0.12], ["walk", 0.08], ["rankings", 0.18], ["directory", 0.1], ["x.com", 0.12], ["share", 0.06], ["embed", 0.04]];
    for (const [source, share] of sources) {
      await db.insert(schema.boothReferrers).values({ boothId, source, views: Math.floor(tv * share), clicks: Math.floor(tc * share) });
    }
  }

  // Site daily
  for (let d = 29; d >= 0; d--) {
    const ts = nowTs - d * DAY;
    const visits = Math.floor(rnd() * 1500 + 1800);
    await db.insert(schema.siteDaily).values({
      day: dayKey(ts),
      visits,
      uniques: Math.floor(visits * 0.62),
      claims: Math.floor(rnd() * 6 + 1),
      takeovers: Math.floor(rnd() * 3),
      boosts: Math.floor(rnd() * 4),
      revenueCents: Math.floor(rnd() * 90000 + 20000),
      signups: Math.floor(rnd() * 12 + 3),
      outboundClicks: Math.floor(visits * (0.05 + rnd() * 0.04)),
      checkoutStarts: Math.floor(rnd() * 14 + 4),
    });
  }

  // Close last week's season so featured winners and rank movement are demoable.
  await closeSeason(weekBounds(nowTs).startsAt - 7 * DAY);

  feed.sort((a, b) => a.createdAt - b.createdAt);
  await db.insert(schema.events).values(feed.slice(-200));

  // Lobby chat
  const lines = [
    ["Harbor Coffee Co.", 4, "Morning everyone, fresh batch on the site today ☕"],
    ["$ORBIT", 3, "orbit holders assemble, we're climbing the rankings"],
    ["Pixel & Pine", 2, "Just moved our logo to the rooftop sign. looks so good at night"],
    ["Meridian Comics", 1, "Got 400 banner clicks this week. Not bad for a booth."],
    ["Looma", 6, "Anyone else notice booth #20 keeps changing hands lol"],
    ["Quarter Moon", 7, "signing at our booth right now, link on the banner"],
  ];
  const chatOwner = owners[0];
  let ct = nowTs - 6 * 3600_000;
  for (const [who, booth, body] of lines) {
    ct += Math.floor(rnd() * 50 + 10) * 60_000;
    await db.insert(schema.messages).values({ id: newId(), room: "lobby", userId: chatOwner, authorName: who as string, authorBoothId: booth as number, body: body as string, createdAt: ct });
  }

  console.log(`Seeded ${claimed.length} exhibitors, $${(salesTotal / 100).toFixed(0)} in sales, ${feed.length} events.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
