/** Shared by the hall screen, the admin page and the server: which film is on at a given moment. No imports, so it bundles anywhere. */
export function scheduleAt(items: { duration: number }[], nowS: number): { index: number; offset: number } {
  if (items.length === 0) return { index: 0, offset: 0 };
  // an item of unknown length breaks the loop maths: give every item a ten-minute turn instead and start from the top
  if (items.some((i) => !(i.duration > 0))) return { index: Math.floor(nowS / 600) % items.length, offset: -1 };
  const total = items.reduce((a, i) => a + i.duration, 0);
  let t = nowS % total;
  for (let i = 0; i < items.length; i++) { if (t < items[i].duration) return { index: i, offset: t }; t -= items[i].duration; }
  return { index: 0, offset: 0 };
}

/**
 * The programme: the showing on now and the next `count - 1` starts, as epoch seconds. The loop is anchored to the
 * epoch, so every visitor computes the same times and they can be published ("Godzilla · 21:40 UTC").
 * Items of unknown length take ten-minute turns, matching scheduleAt.
 */
export function showtimes(items: { duration: number }[], nowS: number, count = 8): Array<{ index: number; startS: number; endS: number; now: boolean }> {
  if (items.length === 0) return [];
  const unknown = items.some((i) => !(i.duration > 0));
  const len = (i: number) => (unknown ? 600 : items[i].duration);
  const out: Array<{ index: number; startS: number; endS: number; now: boolean }> = [];
  const s = scheduleAt(items, nowS);
  let index = s.index;
  let startS = unknown ? Math.floor(nowS / 600) * 600 : nowS - s.offset;
  for (let k = 0; k < count; k++) {
    out.push({ index, startS, endS: startS + len(index), now: k === 0 });
    startS += len(index); index = (index + 1) % items.length;
  }
  return out;
}
