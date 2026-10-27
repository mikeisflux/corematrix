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
