/**
 * Seeds a believable demo city: ~140 buildings across districts, 30 days of
 * metrics, a sales history and an activity feed. Run: npm run seed
 * Idempotent-ish: skips if plots already exist unless --force.
 */
import "dotenv/config";
import { sql } from "drizzle-orm";
import { db, ensureMigrated, schema } from "../src/lib/db";
import { claimPriceCents } from "../src/lib/economy";
import { newCode, newId, seeded, dayKey } from "../src/lib/util";
import { splitTakeover, zoneFor } from "../src/lib/config";
import { floorsForValue } from "../src/lib/city/layout";
import { closeSeason } from "../src/lib/seasons";
import { weekBounds } from "../src/lib/util";

const force = process.argv.includes("--force");

const NAMES: Array<[string, string, string, string]> = [
  // name, tagline, district, website
  ["Northwind Labs", "Infra for teams that ship", "startup-alley", "northwind.dev"],
  ["Pixel & Pine", "Indie game studio", "creator-corner", "pixelpine.gg"],
  ["$ORBIT", "Community token. No promises, just orbit.", "crypto-row", "orbit.fun"],
  ["Harbor Coffee Co.", "Roasted on the pier", "main-street", "harborcoffee.co"],
  ["Complex Law", "Tech and consumer claims", "main-street", "complexlaw.example"],
  ["Looma", "Design tokens that sync", "startup-alley", "looma.app"],
  ["Night Owl Radio", "24/7 lo-fi", "creator-corner", "nightowl.fm"],
  ["Vaultline", "Cold storage for DAOs", "crypto-row", "vaultline.xyz"],
  ["Greenhouse Supply", "Hydro gear, same-day", "main-street", "greenhouse.supply"],
  ["Kestrel AI", "Agents for ops teams", "startup-alley", "kestrel.ai"],
  ["Wobin Hood", "An NFT with a whole world", "crypto-row", "wobin.world"],
  ["Studio Marrow", "Illustration + motion", "creator-corner", "marrow.studio"],
  ["Ferrocat", "Rugged phone mounts", "main-street", "ferrocat.com"],
  ["Driftpad", "Notes that move with you", "startup-alley", "driftpad.io"],
  ["$GATTO", "Built to last", "crypto-row", "gatto.cat"],
  ["Blue Door Books", "Used, rare, loved", "main-street", "bluedoorbooks.shop"],
  ["Oakline Motors", "EV conversions", "main-street", "oakline.motors"],
  ["Parallax", "3D for the web", "startup-alley", "parallax.gl"],
  ["MOONFROG", "ribbit ribbit", "crypto-row", "moonfrog.lol"],
  ["The Daily Spark", "Newsletter for makers", "creator-corner", "dailyspark.news"],
  ["Summit Dental", "Smiles downtown", "main-street", "summitdental.example"],
  ["Helix Fitness", "Strength, simply", "main-street", "helixfit.example"],
  ["Quill", "Writing assistant for lawyers", "startup-alley", "quill.legal"],
  ["Riverbend Realty", "Homes on the water", "main-street", "riverbend.realty"],
  ["ZK Collective", "Proofs, not promises", "crypto-row", "zkcollective.org"],
  ["Pepper & Salt", "Street food truck", "main-street", "pepperandsalt.food"],
  ["Beacon Analytics", "Dashboards in a day", "startup-alley", "beacon.run"],
  ["Lantern Press", "Small-batch zines", "creator-corner", "lanternpress.ink"],
  ["Tidewater Surf", "Boards, wax, stoke", "main-street", "tidewater.surf"],
  ["ApexDAO", "Treasury tooling", "crypto-row", "apexdao.xyz"],
  ["Mira Studio", "Photography", "creator-corner", "mira.photo"],
  ["Bricklane Pizza", "Wood-fired since 2011", "main-street", "bricklane.pizza"],
  ["Sidecar", "Billing for AI apps", "startup-alley", "sidecar.money"],
  ["Hollow Knight Fan Hub", "Community wiki", "creator-corner", "hkfans.wiki"],
  ["Ironclad Security", "Pen-testing, fixed price", "startup-alley", "ironclad.sec"],
  ["Pond Wallet", "The frog-friendly wallet", "crypto-row", "pond.cash"],
  ["Copperleaf Garden", "Native plants nursery", "main-street", "copperleaf.garden"],
  ["Echo Chamber", "Podcast network", "creator-corner", "echochamber.fm"],
  ["Formworks", "Forms that don't suck", "startup-alley", "formworks.so"],
  ["Luna Bakery", "Croissants at 6am", "main-street", "lunabakery.example"],
];

const ADJ = ["Apex", "North", "Blue", "Iron", "Solar", "Velvet", "Granite", "Cobalt", "Amber", "Cedar", "Quantum", "Mint", "Ember", "Onyx", "Civic", "Harbor", "Atlas", "Nova", "Pilot", "Ridge"];
const NOUN = ["Works", "Labs", "Collective", "Studio", "Supply", "Capital", "House", "Guild", "Forge", "Market", "Depot", "Signal", "Press", "Garage", "Foundry", "Club", "Exchange", "Kitchen", "Systems", "Co."];
const STYLES = ["modern", "glass", "brick", "neon", "deco"];
const ROOFS = ["flat", "spire", "antenna", "garden", "billboard"];
const PALETTE = ["#e63946", "#f4a261", "#2a9d8f", "#264653", "#e9c46a", "#8338ec", "#3a86ff", "#ff006e", "#fb5607", "#06d6a0", "#118ab2", "#ef476f", "#ffd166", "#073b4c", "#9b5de5", "#00bbf9", "#00f5d4", "#f15bb5", "#fee440", "#1b998b", "#2d3142", "#4f5d75", "#bfc0c0", "#ef8354", "#5c4b51", "#8cbeb2", "#f2ebbf", "#f3b562", "#f06060"];

async function main() {
  await ensureMigrated();
  const existing = await db.select({ c: sql<number>`count(*)` }).from(schema.plots);
  if (Number(existing[0]?.c ?? 0) > 0 && !force) {
    console.log("Plots exist; pass --force to reseed.");
    return;
  }
  if (force) {
    for (const t of [schema.plots, schema.users, schema.sessions, schema.transactions, schema.events, schema.plotDaily, schema.plotReferrers, schema.visitorSeen, schema.siteDaily, schema.messages, schema.notifications, schema.billboards, schema.seasons, schema.coinLedger, schema.gameScores, schema.gamePlays]) {
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

  // Which plots are claimed: dense in the first 150, sparse up to ~420
  const claimed: number[] = [];
  for (let p = 1; p <= 420; p++) {
    const dense = p <= 150 ? 0.82 : p <= 260 ? 0.35 : 0.12;
    if (rnd() < dense) claimed.push(p);
  }

  let nameIdx = 0;
  const feed: Array<typeof schema.events.$inferInsert> = [];
  let salesTotal = 0;

  for (const plotId of claimed) {
    let name: string, tagline: string, district: string, website: string;
    if (nameIdx < NAMES.length) {
      [name, tagline, district, website] = NAMES[nameIdx++];
    } else {
      name = `${pick(ADJ)} ${pick(NOUN)}`;
      tagline = pick(["Doing the thing.", "Est. 2024", "Ask us anything", "We ship weekly", "Open late", "Now hiring", "Built different", "Quietly excellent"]);
      district = pick(["downtown", "crypto-row", "startup-alley", "creator-corner", "main-street"]);
      website = `${name.toLowerCase().replace(/[^a-z]+/g, "")}.example`;
    }
    if (plotId <= 24 && rnd() < 0.6) district = "downtown";
    const owner = pick(owners);
    const claimedAt = nowTs - Math.floor(rnd() * 55 + 2) * DAY;
    const zone = zoneFor(plotId);
    const floors = Math.max(zone.minFloors, Math.min(120, Math.floor(rnd() * (plotId <= 40 ? 60 : 25)) + zone.minFloors));
    const basePrice = claimPriceCents(plotId, floors);
    let value = basePrice;
    let salesCount = 1;
    const txs: Array<typeof schema.transactions.$inferInsert> = [];
    txs.push({ id: newId(), plotId, kind: "claim", buyerId: owner, amountCents: basePrice, platformCents: basePrice, valueBefore: 0, valueAfter: basePrice, status: "paid", provider: "sandbox", createdAt: claimedAt, paidAt: claimedAt });
    salesTotal += basePrice;
    // Takeovers / boosts: popular low plots have a history
    const rounds = plotId <= 30 ? Math.floor(rnd() * 6) : plotId <= 120 ? Math.floor(rnd() * 3) : rnd() < 0.2 ? 1 : 0;
    let t = claimedAt;
    let currentOwner = owner;
    for (let r = 0; r < rounds; r++) {
      t += Math.floor(rnd() * 6 + 1) * DAY + Math.floor(rnd() * 20) * 3600_000;
      if (t > nowTs - 2 * 3600_000) break;
      if (rnd() < 0.5) {
        const { price, sellerPayout, platform } = splitTakeover(value);
        const buyer = pick(owners);
        txs.push({ id: newId(), plotId, kind: "takeover", buyerId: buyer, sellerId: currentOwner, amountCents: price, sellerPayoutCents: sellerPayout, platformCents: platform, valueBefore: value, valueAfter: price, status: "paid", provider: "sandbox", createdAt: t, paidAt: t });
        salesTotal += price;
        value = price;
        currentOwner = buyer;
        salesCount++;
        feed.push({ id: newId(), type: "takeover", plotId, title: `${name} took over Plot #${plotId}`, detail: `Bought for $${(price / 100).toFixed(0)}`, amountCents: price, createdAt: t });
      } else {
        const amt = Math.round((rnd() * 4000 + 500) / 100) * 100;
        txs.push({ id: newId(), plotId, kind: "boost", buyerId: currentOwner, amountCents: amt, platformCents: amt, valueBefore: value, valueAfter: value + amt, status: "paid", provider: "sandbox", createdAt: t, paidAt: t });
        salesTotal += amt;
        value += amt;
        feed.push({ id: newId(), type: "boost", plotId, title: `${name} grew taller`, detail: `+$${(amt / 100).toFixed(0)} in value`, amountCents: amt, createdAt: t });
      }
    }
    const tier = value > 30000 && rnd() < 0.5 ? "landmark" : value > 8000 && rnd() < 0.5 ? "pro" : "free";
    const color = pick(PALETTE);
    await db.insert(schema.plots).values({
      id: plotId,
      ownerId: currentOwner,
      name,
      tagline,
      description: rnd() < 0.5 ? `${name} — ${tagline}. Find us at Plot #${plotId}.` : null,
      website: `https://${website}`,
      logoUrl: null,
      color,
      accent: "#ffffff",
      style: pick(STYLES),
      shape: pick(["tower", "tower", "tower", "stepped", "twin", "cantilever", "spire"]),
      floors: Math.max(floors, floorsForValue(value)),
      roof: pick(ROOFS),
      district,
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
    feed.push({ id: newId(), type: "claim", plotId, title: `${name} joined the avenue`, detail: `Plot #${plotId}`, amountCents: basePrice, createdAt: claimedAt });

    // 30 days of metrics; traffic scales with value and recency
    const pop = Math.log2(value / 100 + 2) * (plotId <= 40 ? 2.2 : 1);
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
      await db.insert(schema.plotDaily).values({ plotId, day: dayKey(ts), impressions, hovers, views, clicks, uniques });
    }
    await db.update(schema.plots).set({ totalViews: tv, totalClicks: tc, totalImpressions: ti }).where(sql`id = ${plotId}`);
    const sources: Array<[string, number]> = [["skyline", 0.5], ["rankings", 0.18], ["directory", 0.1], ["x.com", 0.12], ["share", 0.06], ["embed", 0.04]];
    for (const [source, share] of sources) {
      await db.insert(schema.plotReferrers).values({ plotId, source, views: Math.floor(tv * share), clicks: Math.floor(tc * share) });
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
    ["Northwind Labs", 1, "Got 40 clicks from the skyline this week. Not bad for $15."],
    ["Looma", 6, "Anyone else notice plot #20 keeps changing hands lol"],
    ["Night Owl Radio", 7, "we're live right now, link on the building"],
  ];
  const chatOwner = owners[0];
  let ct = nowTs - 6 * 3600_000;
  for (const [who, plot, body] of lines) {
    ct += Math.floor(rnd() * 50 + 10) * 60_000;
    await db.insert(schema.messages).values({ id: newId(), room: "lobby", userId: chatOwner, authorName: who as string, authorPlotId: plot as number, body: body as string, createdAt: ct });
  }

  console.log(`Seeded ${claimed.length} buildings, $${(salesTotal / 100).toFixed(0)} in sales, ${feed.length} events.`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
