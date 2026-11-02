/**
 * The game's numbers, with no server imports: the arcade machines, coin rules, quest definitions and season prizes.
 * lib/arcade.ts, lib/quests.ts and lib/seasons.ts re-export them for the server; the docs and the hall read them here.
 */
import { REFERRAL_COINS } from "@/lib/config";
import type { QuestId } from "@/lib/quest-progress";

export const GAMES = {
  snake: { name: "Serpent Ave.", blurb: "Classic snake. Eat, grow, don't crash.", cost: 2, prizeAt: 400, prize: 25 },
  breakout: { name: "Block Party", blurb: "Smash the longboxes brick by brick.", cost: 2, prizeAt: 800, prize: 30 },
  runner: { name: "Rooftop Run", blurb: "Jump the gaps. One button. Endless.", cost: 3, prizeAt: 1500, prize: 40 },
  swarm: { name: "Star Swarm", blurb: "The classic formation shooter. They dive, you don't blink.", cost: 3, prizeAt: 5000, prize: 60 },
  rocks: { name: "Rock Field", blurb: "Thrust, turn, shoot. Big rocks make little rocks.", cost: 3, prizeAt: 3000, prize: 45 },
  paddle: { name: "Paddle Duel", blurb: "Pong against the house. It gets mean.", cost: 2, prizeAt: 800, prize: 30 },
  stack: { name: "Longbox Stack", blurb: "Falling blocks. Clear lines, don't top out.", cost: 3, prizeAt: 2500, prize: 45 },
  flap: { name: "Cape Flap", blurb: "One button. Through the gaps. Keep the cape on.", cost: 2, prizeAt: 300, prize: 30 },
  cross: { name: "Aisle Crosser", blurb: "Hop across the hand carts to the far side of the hall.", cost: 2, prizeAt: 1000, prize: 35 },
  whack: { name: "Whack-a-Villain", blurb: "45 seconds. Purple villains, teal fans. Don't whack the fans.", cost: 1, prizeAt: 400, prize: 20 },
  match: { name: "Cover Match", blurb: "Eight pairs, sixty seconds, a good memory.", cost: 1, prizeAt: 1100, prize: 25 },
} as const;
export type GameId = keyof typeof GAMES;

export const COIN_RULES = {
  dailyVisit: 5,
  streakBonusPerDay: 1, // up to +10
  explore: 1, // first view of a booth each day (max 10/day)
  claim: 50,
  referral: REFERRAL_COINS,
  flyoverCost: 5,
  convertRate: 100, // coins per $1 of booth value when converting
  packs: [
    { id: "pack_small", coins: 100, priceCents: 199 },
    { id: "pack_med", coins: 350, priceCents: 499 },
    { id: "pack_big", coins: 1000, priceCents: 999 },
  ],
} as const;

export const QUESTS: Record<QuestId, { title: string; detail: string; icon: string; goal: number; coins: number; unit?: string }> = {
  visit: { title: "Open three booths", detail: "Booths you haven't opened today count. Walk up and press E, or click one on the map.", icon: "🏪", goal: 3, coins: 10 },
  theater: { title: "Watch five minutes in the theater", detail: "Stand or sit near the arcade screen while a film plays.", icon: "🎬", goal: 300, coins: 10, unit: "s" },
  arcade: { title: "Play one arcade round", detail: "Any machine. A finished round counts, however it went.", icon: "🕹️", goal: 1, coins: 10 },
};
export const BONUS_COINS = 15;

export const SEASON_PRIZES = [300, 150, 75] as const;
