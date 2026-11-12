/**
 * The all-ages text filter: one place that decides whether words typed by a visitor or an exhibitor are fit for a
 * hall open to everyone aged 13 and up. No database and no three.js here, so the server and the browser share it.
 *
 * Two answers for two kinds of text:
 *  - `maskText` for conversation (hall chat, whispers): vulgar words are starred out and the message goes through;
 *  - `checkText` for anything that stands on the floor under someone's name (display names, handles, job titles,
 *    booth names and listings, shop items, billboards, team names): the text is refused with a reason.
 * Slurs and explicit sexual words are `severe`: conversation carrying one is refused outright instead of starred.
 *
 * Matching is by word, after undoing the usual disguises: accents, look-alike digits and symbols (sh1t, a$$),
 * stretched letters (fuuuck), and letters spelled out with spaces or dots (f u c k, f.u.c.k). A few stems are matched
 * inside longer words (so compounds are caught); everything else must be the whole word, which keeps Scunthorpe,
 * cockpit, assassin and class out of trouble. Mild words (damn, hell, crap) are allowed: the bar is a teen rating.
 */

/** Whole words, starred in chat and refused in names. */
const VULGAR = [
  "ass", "asses", "arse", "arsehole", "asshole", "assholes", "asshat", "jackass", "dumbass", "badass", "smartass", "fatass",
  "bitch", "bitches", "bitchy", "bitching", "biatch", "bastard", "bastards", "bollocks", "bugger", "bullshit",
  "cock", "cocks", "crackhead", "cum", "cumming", "dick", "dicks", "dickhead", "dildo", "douche", "douchebag",
  "fap", "fapping", "goddamn", "goddamnit", "hoe", "hoes", "horny", "jizz", "knob", "knobhead",
  "milf", "muff", "nads", "nutsack", "pecker", "piss", "pissed", "pissing", "prick", "pricks", "pube", "pubes",
  "pussy", "pussies", "schlong", "screwyou", "shag", "shagging", "skank", "slut", "sluts", "slutty", "smut", "spunk",
  "stfu", "gtfo", "wtf", "lmfao", "tit", "tits", "titty", "titties", "boob", "boobs", "boobies", "turd", "twat", "twats",
  "wank", "wanker", "wankers", "wanking", "whore", "whores", "thot", "thots", "sexy", "sexting", "sext", "nudes", "nude",
  "naked", "stripper", "strippers", "boner", "erection", "orgasm", "horniness", "kinky", "fetish", "bdsm", "hooker", "hookers",
  "weed", "cocaine", "meth", "heroin",
];
/** Stems caught anywhere inside a word (compounds and endings), starred in chat and refused in names. */
const VULGAR_STEMS = ["fuck", "fuk", "fck", "phuck", "shit", "sht", "cunt", "motherf", "cocksuck", "dipshit", "jerkoff", "blowjob", "handjob", "rimjob", "bukkake"];
/** Whole words that refuse a chat message outright: slurs and explicit sexual words. */
const SEVERE = [
  "nigger", "niggers", "nigga", "niggas", "faggot", "faggots", "fag", "fags", "dyke", "dykes", "tranny", "trannies", "retard", "retards", "retarded",
  "spic", "spics", "chink", "chinks", "gook", "gooks", "kike", "kikes", "wetback", "wetbacks", "coon", "coons", "paki", "pakis", "raghead", "towelhead",
  "beaner", "beaners", "shemale", "porn", "porno", "pornhub", "xxx", "hentai", "anal", "anus", "penis", "penises", "vagina", "vaginas", "clit", "clitoris",
  "cumshot", "creampie", "gangbang", "deepthroat", "fellatio", "cunnilingus", "masturbate", "masturbating", "masturbation", "ejaculate", "rape", "raped", "rapist", "raping",
  "molest", "molester", "pedo", "pedophile", "paedophile", "incest", "bestiality", "onlyfans", "camgirl", "escort", "escorts", "nazi", "nazis", "hitler", "kkk", "sex", "sexual",
];
const SEVERE_STEMS = ["nigg", "fagg", "pornhub", "childporn", "kys"];
/** Words that contain a blocked stem or look like a blocked word once disguises are undone, but are fine. */
const ALLOWED = [
  "scunthorpe", "shitake", "shiitake", "mishit", "cockpit", "cocktail", "cocktails", "cockatoo", "cockatiel", "peacock", "hancock", "woodcock", "dickens", "dickinson",
  "assassin", "assassins", "class", "classic", "classes", "bass", "brass", "grass", "glass", "pass", "mass", "assist", "assume", "assemble", "asset", "assets", "passion", "compass",
  "analysis", "analyst", "analog", "analogue", "canal", "banal", "sussex", "essex", "middlesex", "sextant", "sextet", "unisex", "therapist", "grape", "drape", "scrape", "skyscraper",
  "cumulative", "cucumber", "document", "circumstance", "title", "titan", "titans", "titanic", "constitution", "button", "matsushita", "hello", "shell", "raccoon", "cocoon", "tycoon",
  "spice", "spicy", "hospice", "pakistan", "pakistani", "nudge", "weeds", "seaweed", "tweed", "method", "methods", "ass.", "escorted", "knobs", "doorknob",
];

const LOOKALIKE: Record<string, string> = { "0": "o", "1": "i", "3": "e", "4": "a", "5": "s", "7": "t", "8": "b", "9": "g", "@": "a", "$": "s", "!": "i", "|": "i", "+": "t", "€": "e", "£": "l" };
/** Lowercase letters only: accents stripped, look-alikes mapped back, anything else dropped. */
function plain(word: string): string {
  let out = "";
  for (const ch of word.normalize("NFKD").toLowerCase()) {
    if (ch >= "a" && ch <= "z") out += ch;
    else if (LOOKALIKE[ch]) out += LOOKALIKE[ch];
  }
  return out;
}
/** A stretched word pulled back: runs of the same letter cut to `max`. */
const squeeze = (w: string, max: number) => w.replace(/(.)\1+/g, (run, ch: string) => ch.repeat(Math.min(max, run.length)));

export type Severity = "vulgar" | "severe";
interface Lists { vulgar: Set<string>; severe: Set<string>; vulgarStems: string[]; severeStems: string[]; allowed: Set<string> }
const BASE: Lists = { vulgar: new Set(VULGAR), severe: new Set(SEVERE), vulgarStems: VULGAR_STEMS, severeStems: SEVERE_STEMS, allowed: new Set(ALLOWED) };
let lists = BASE; let enabled = true;

/** Site-wide adjustments from the admin settings: extra blocked words, words to let through, and the off switch. */
export function configureFilter(opts: { enabled?: boolean; block?: string[]; allow?: string[] }) {
  enabled = opts.enabled !== false;
  const block = (opts.block ?? []).map(plain).filter((w) => w.length >= 2), allow = (opts.allow ?? []).map(plain).filter(Boolean);
  if (!block.length && !allow.length) { lists = BASE; return; }
  const drop = new Set(allow);
  lists = {
    vulgar: new Set([...VULGAR, ...block].filter((w) => !drop.has(w))), severe: new Set(SEVERE.filter((w) => !drop.has(w))),
    vulgarStems: VULGAR_STEMS.filter((w) => !drop.has(w)), severeStems: SEVERE_STEMS.filter((w) => !drop.has(w)), allowed: new Set([...ALLOWED, ...allow]),
  };
}

/** Is this one word (already made plain) blocked, and how badly? */
function judge(w: string): Severity | null {
  if (w.length < 2 || lists.allowed.has(w)) return null;
  // as typed, then with stretched letters pulled back to two and to one (fuuuck, shiiit; "ass" survives the first)
  for (const v of new Set([w, squeeze(w, 2), squeeze(w, 1)])) {
    if (lists.allowed.has(v)) return null;
    if (lists.severe.has(v) || lists.severeStems.some((s) => v.includes(s))) return "severe";
    if (lists.vulgar.has(v) || lists.vulgarStems.some((s) => v.includes(s))) return "vulgar";
  }
  return null;
}

export interface Hit { start: number; end: number; severity: Severity }
/** Every blocked stretch of the text, in order. */
export function findBlocked(text: string): Hit[] {
  if (!enabled || !text) return [];
  const hits: Hit[] = [];
  // words: letters and digits with the symbols people swap in for letters; a trailing ! is punctuation, not an i
  const words = [...text.matchAll(/[\p{L}\p{N}@$|+€£]+(?:![\p{L}\p{N}@$|+€£]+)*/gu)].map((m) => ({ start: m.index, end: m.index + m[0].length, plain: plain(m[0]), raw: m[0] }));
  const taken = new Array<boolean>(words.length).fill(false);
  words.forEach((w, i) => { const s = /^\d+$/.test(w.raw) ? null : judge(w.plain); if (s) { hits.push({ start: w.start, end: w.end, severity: s }); taken[i] = true; } });
  // letters spelled out one or two at a time (f u c k, f.u.c.k, fu ck): runs of short pieces are judged joined up
  for (let i = 0; i < words.length; i++) {
    if (taken[i] || words[i].plain.length === 0 || words[i].plain.length > 2) continue;
    let j = i, joined = "";
    while (j < words.length && !taken[j] && words[j].plain.length > 0 && words[j].plain.length <= 2 && (j === i || text.slice(words[j - 1].end, words[j].start).length <= 3)) { joined += words[j].plain; j++; }
    if (j - i >= 2 && joined.length >= 3) {
      // the longest blocked stretch inside the run, so "a s s" in "it was a s s o" is found without flagging the lot
      for (let a = i; a < j; a++) for (let b = j; b > a + 1; b--) {
        const piece = words.slice(a, b).map((w) => w.plain).join(""); const s = piece.length >= 3 ? judge(piece) : null;
        if (s) { hits.push({ start: words[a].start, end: words[b - 1].end, severity: s }); for (let k = a; k < b; k++) taken[k] = true; a = b - 1; break; }
      }
    }
    i = Math.max(i, j - 1);
  }
  return hits.sort((a, b) => a.start - b.start);
}

/** For conversation: blocked words starred out. `severe` says the text carried a slur or explicit sexual word. */
export function maskText(text: string): { text: string; changed: boolean; severe: boolean } {
  const hits = findBlocked(text); if (!hits.length) return { text, changed: false, severe: false };
  let out = "", at = 0;
  for (const h of hits) { if (h.start < at) continue; out += text.slice(at, h.start) + "*".repeat(Math.max(3, Math.min(8, h.end - h.start))); at = h.end; }
  return { text: out + text.slice(at), changed: true, severe: hits.some((h) => h.severity === "severe") };
}

/** For names and listings: null when the text is fine, otherwise the reason to show the person. `what` names the field ("Booth name"). */
export function checkText(text: string | null | undefined, what = "That"): string | null {
  if (!text) return null;
  return findBlocked(text).length ? `${what} has language that isn't allowed here. ForeverComicCon is open to ages 13 and up, so please keep it clean.` : null;
}
/** Throws the reason for the first field that fails: `assertClean({ "Booth name": name, Tagline: tagline })`. */
export function assertClean(fields: Record<string, string | null | undefined>) {
  for (const [what, text] of Object.entries(fields)) { const why = checkText(text, what); if (why) throw new Error(why); }
}
export const isClean = (text: string | null | undefined) => !text || findBlocked(text).length === 0;
