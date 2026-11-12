/**
 * Nudity check for uploaded images. A small image classifier (nsfwjs, MobileNetV2) runs on the server, in plain
 * JavaScript, with its model read from node_modules: nothing is sent to an outside service. The hall is open to ages 13
 * and up, so an image that scores as explicit is refused, unless it is a piece that may be marked 18+ (see art.ts).
 *
 * The check fails open: if the model cannot load or an image cannot be read, the upload goes through and the error is
 * logged, so a broken classifier never stops exhibitors from working.
 */
import { getSettings } from "@/lib/settings";

type Model = { classify: (img: unknown, topk?: number) => Promise<{ className: string; probability: number }[]> };
type Tf = { tensor3d: (d: Uint8Array, shape: [number, number, number], dtype: "int32") => { dispose: () => void } };
const g = globalThis as unknown as { __fccNsfw?: Promise<{ model: Model; tf: Tf }> };

function load() {
  g.__fccNsfw ??= (async () => {
    const tf = (await import("@tensorflow/tfjs")) as unknown as Tf;
    const nsfw = (await import("nsfwjs")) as unknown as { load: (name: string) => Promise<Model> };
    return { model: await nsfw.load("MobileNetV2"), tf };
  })().catch((e) => { g.__fccNsfw = undefined; throw e; });
  return g.__fccNsfw;
}

let cfg = { on: true, threshold: 0.6, at: 0 };
async function config() {
  if (Date.now() - cfg.at < 60_000) return cfg;
  try {
    const s = await getSettings(["NUDITY_FILTER", "NUDITY_THRESHOLD"]);
    const t = Number(s.NUDITY_THRESHOLD);
    cfg = { on: !/^(false|off|0|no)$/i.test((s.NUDITY_FILTER ?? "").trim()), threshold: t > 0 && t <= 1 ? t : 0.6, at: Date.now() };
  } catch { cfg = { ...cfg, at: Date.now() }; }
  return cfg;
}

export const NUDITY_REFUSED = "That image looks like it shows nudity or sexual content. ForeverComicCon is open to ages 13 and up, so it can't be shown here.";
/** Slots whose image may be kept as 18+ (shown blurred until a viewer confirms their age). Banners, signs and logos may not. */
export const adultAllowed = (slot: string) => slot.startsWith("gallery:") || slot.startsWith("book:") || slot.startsWith("product:");

/**
 * Scores an image from 0 to 1 (explicit photo + explicit drawing). The whole picture is scored, and so is each square
 * third of a long one, so something explicit in one corner of a wide banner is still seen; the highest score counts.
 */
export async function nudityScore(buf: Buffer): Promise<number> {
  const sharp = (await import("sharp")).default;
  const { model, tf } = await load();
  const base = sharp(buf, { failOn: "none", limitInputPixels: 80_000_000, animated: false }).rotate().flatten({ background: "#ffffff" });
  const meta = await base.metadata();
  const w = meta.width ?? 0, h = meta.height ?? 0;
  if (!w || !h) return 0;
  const views: Buffer[] = [await base.clone().resize(224, 224, { fit: "fill" }).removeAlpha().raw().toBuffer()];
  const long = Math.max(w, h), short = Math.min(w, h);
  if (long / short >= 1.5) {
    const n = Math.min(4, Math.ceil(long / short));
    for (let i = 0; i < n; i++) {
      const off = Math.round(((long - short) * i) / (n - 1));
      const region = w >= h ? { left: off, top: 0, width: short, height: short } : { left: 0, top: off, width: short, height: short };
      // a fresh pipeline per crop: rotate() and extract() on one shared pipeline apply in an order sharp picks
      const upright = await base.clone().png().toBuffer();
      views.push(await sharp(upright).extract(region).resize(224, 224, { fit: "fill" }).removeAlpha().raw().toBuffer());
    }
  }
  let top = 0;
  for (const px of views) {
    const img = tf.tensor3d(new Uint8Array(px), [224, 224, 3], "int32");
    try {
      const out = await model.classify(img, 5);
      const p = (name: string) => out.find((o) => o.className === name)?.probability ?? 0;
      top = Math.max(top, p("Porn") + p("Hentai"));
    } finally { img.dispose(); }
  }
  return top;
}

/** True when the image should be refused (or marked 18+). Never throws. */
export async function looksNude(buf: Buffer): Promise<boolean> {
  try {
    const c = await config();
    if (!c.on) return false;
    return (await nudityScore(buf)) >= c.threshold;
  } catch (e) {
    console.error("[nudity] check failed, letting the image through:", (e as Error).message);
    return false;
  }
}
/** The same check for a `data:image/...;base64,` URL; anything else (a web link, a path) is not checked. */
export async function dataUrlLooksNude(url: string | null | undefined): Promise<boolean> {
  const m = url ? /^data:image\/[a-z+]+;base64,([A-Za-z0-9+/=]+)$/i.exec(url) : null;
  return m ? looksNude(Buffer.from(m[1], "base64")) : false;
}

/** The stand-in shown for an 18+ piece until the viewer confirms their age: the picture blurred past recognition, darkened, with an 18+ mark. */
export async function censored(buf: Buffer): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  const src = sharp(buf, { failOn: "none", animated: false });
  const meta = await src.metadata();
  const w = Math.min(meta.width ?? 600, 900), h = Math.max(1, Math.round(((meta.height ?? 750) * w) / (meta.width ?? 600)));
  const tiny = await src.flatten({ background: "#111111" }).resize(12, 12, { fit: "fill" }).blur(2).png().toBuffer();
  const s = Math.round(Math.min(w, h) * 0.34); // the mark's size; drawn from plain shapes so it needs no font on the server
  const mark = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
<rect width="${w}" height="${h}" fill="#000" opacity="0.3"/>
<g transform="translate(${w / 2 - s / 2} ${h / 2 - s / 2}) scale(${s / 100})">
<circle cx="50" cy="50" r="48" fill="#000" opacity="0.55" stroke="#fff" stroke-width="4"/>
<g fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round">
<path d="M19 38 L27 32 L27 68"/><ellipse cx="48" cy="40" rx="8.5" ry="8"/><ellipse cx="48" cy="58.5" rx="10" ry="9.5"/><path d="M68 50 L84 50 M76 42 L76 58"/>
</g></g></svg>`);
  return sharp(tiny).resize(w, h, { fit: "fill", kernel: "cubic" }).composite([{ input: mark }]).jpeg({ quality: 70 }).toBuffer();
}
