/** The slot machine's symbols, bets and pay table: shared by the server (which draws) and the page (which shows them). */
/** One reel strip: weight = how many of the 32 stops show the symbol; triple = payout for three in a row, in bets. */
export const SLOT_SYMBOLS = [
  { id: "seven", glyph: "7️⃣", name: "Lucky seven", weight: 1, triple: 150 },
  { id: "gem", glyph: "💎", name: "Gem", weight: 2, triple: 60 },
  { id: "hero", glyph: "🦸", name: "Hero", weight: 3, triple: 40 },
  { id: "villain", glyph: "🦹", name: "Villain", weight: 4, triple: 25 },
  { id: "pow", glyph: "💥", name: "Pow", weight: 4, triple: 18 },
  { id: "alien", glyph: "👾", name: "Invader", weight: 5, triple: 15 },
  { id: "ticket", glyph: "🎟️", name: "Ticket", weight: 6, triple: 12 },
  { id: "comic", glyph: "📚", name: "Longbox", weight: 7, triple: 9 },
] as const;
export type SlotSymbol = (typeof SLOT_SYMBOLS)[number]["id"];
export const SLOT_BETS = [1, 2, 5, 10, 25] as const;
/** The smaller pays, in order of precedence after a triple; the last applies to any other pair. */
export const SLOT_PAIRS: Array<{ id: SlotSymbol | "any"; count: number; pays: number; label: string }> = [
  { id: "seven", count: 2, pays: 5, label: "Two sevens" },
  { id: "gem", count: 2, pays: 3, label: "Two gems" },
  { id: "hero", count: 2, pays: 2, label: "Two heroes" },
  { id: "seven", count: 1, pays: 1, label: "One seven" },
  { id: "any", count: 2, pays: 1, label: "Any other pair" },
];
export const STRIP: SlotSymbol[] = SLOT_SYMBOLS.flatMap((s) => Array<SlotSymbol>(s.weight).fill(s.id));

/** Payout multiplier (in bets) and the winning line's name for three drawn symbols. */
export function payout(reels: SlotSymbol[]): { mult: number; line: string | null } {
  const [a, b, c] = reels;
  if (a === b && b === c) { const s = SLOT_SYMBOLS.find((x) => x.id === a)!; return { mult: s.triple, line: `Three ${s.name.toLowerCase()}s` }; }
  const count = (id: SlotSymbol) => reels.filter((r) => r === id).length;
  for (const p of SLOT_PAIRS) {
    if (p.id === "any") { if (a === b || b === c || a === c) return { mult: p.pays, line: p.label }; }
    else if (count(p.id) === p.count) return { mult: p.pays, line: p.label };
  }
  return { mult: 0, line: null };
}

/** Exact return to player over all 32³ outcomes: how many coins come back per coin bet, over many spins. */
export const SLOT_RTP = (() => {
  let total = 0;
  for (const a of STRIP) for (const b of STRIP) for (const c of STRIP) total += payout([a, b, c]).mult;
  return total / STRIP.length ** 3;
})();

