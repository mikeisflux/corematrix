/** Loads the admin's adjustments to the all-ages text filter (lib/text-filter.ts) from settings, at most once a minute. Server only. */
import { getSettings } from "@/lib/settings";
import { configureFilter } from "@/lib/text-filter";

let loadedAt = 0;
const words = (v: string) => v.split(/[,\n]/).map((w) => w.trim()).filter(Boolean);
/** Call before filtering in a request; cheap when fresh. A settings outage leaves the built-in lists in force. */
export async function loadTextFilter(force = false) {
  if (!force && Date.now() - loadedAt < 60_000) return;
  loadedAt = Date.now();
  try {
    const s = await getSettings(["TEXT_FILTER", "TEXT_FILTER_BLOCK", "TEXT_FILTER_ALLOW"]);
    configureFilter({ enabled: !/^(false|off|0|no)$/i.test((s.TEXT_FILTER ?? "").trim()), block: words(s.TEXT_FILTER_BLOCK ?? ""), allow: words(s.TEXT_FILTER_ALLOW ?? "") });
  } catch { /* keep what is loaded */ }
}
