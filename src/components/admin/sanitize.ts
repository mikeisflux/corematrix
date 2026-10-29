/* Minimal, dependency-free HTML sanitizer usable on the server (no DOM).
   Strips scripts/iframes/objects, event handler attributes and javascript:
   URLs. Regex based — fine for rendering inbound mail in a sandboxed iframe. */
export function sanitizeHtml(input: string): string {
  if (!input) return "";
  let s = input;
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<(script|iframe|object|embed|applet|frame|frameset|meta|link|base|form|input|button|textarea|select)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
  s = s.replace(/<(script|iframe|object|embed|applet|frame|meta|link|base|input|button)\b[^>]*\/?>/gi, "");
  s = s.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_m, css: string) => `<style>${css.replace(/@import[^;]*;?/gi, "").replace(/expression\s*\(/gi, "").replace(/url\s*\(\s*['"]?\s*javascript:[^)]*\)/gi, "")}</style>`);
  s = s.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  s = s.replace(/\s+(href|src|action|formaction|xlink:href|background|poster)\s*=\s*("|')?\s*(javascript|vbscript|data:text\/html)[^"'\s>]*("|')?/gi, ' $1="#"');
  s = s.replace(/\s+srcdoc\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  s = s.replace(/style\s*=\s*"([^"]*)"/gi, (_m, css: string) => `style="${css.replace(/expression\s*\(|javascript:|@import/gi, "")}"`);
  return s;
}

/* Wrap an HTML fragment/document for display inside a sandboxed iframe. */
export function frameDoc(html: string, opts: { dark?: boolean } = {}): string {
  const head = `<base target="_blank"><meta charset="utf-8"><style>
  html,body{margin:0;padding:16px;font:14px/1.55 Arial,Helvetica,sans-serif;${opts.dark === false ? "background:#fff;color:#111" : "background:#0b1020;color:#e8e4ec"}}
  a{color:#ffcf5c} img{max-width:100%;height:auto} pre{white-space:pre-wrap} blockquote{border-left:3px solid #3a3f5c;margin:8px 0;padding:4px 12px;color:#b8b3c0}
  </style>`;
  const clean = sanitizeHtml(html || "");
  if (/<html[\s>]/i.test(clean)) {
    return /<head[\s>]/i.test(clean) ? clean.replace(/<head([^>]*)>/i, `<head$1>${head}`) : clean.replace(/<html([^>]*)>/i, `<html$1><head>${head}</head>`);
  }
  return `<!doctype html><html><head>${head}</head><body>${clean}</body></html>`;
}

/**
 * Browser-only, allow-list cleaner for HTML that goes into the live (non-sandboxed) editor. Parses with
 * DOMParser, which builds an inert document (nothing runs or loads), then keeps only formatting tags and
 * safe attributes. The regex cleaner above can be fooled (`<img/src=x/onerror=...>`, split tags); this can't.
 */
const KEEP = new Set(["A", "B", "STRONG", "I", "EM", "U", "S", "P", "BR", "HR", "DIV", "SPAN", "UL", "OL", "LI", "BLOCKQUOTE", "PRE", "CODE", "H1", "H2", "H3", "H4", "H5", "H6", "TABLE", "THEAD", "TBODY", "TR", "TD", "TH", "IMG", "FONT", "CENTER", "SMALL", "SUB", "SUP"]);
const ATTRS = new Set(["href", "src", "alt", "title", "width", "height", "style", "align", "colspan", "rowspan", "color", "target", "border", "cellpadding", "cellspacing", "bgcolor"]);
export function sanitizeForEditor(input: string): string {
  if (typeof DOMParser === "undefined") return sanitizeHtml(input);
  const doc = new DOMParser().parseFromString(`<body>${input || ""}</body>`, "text/html");
  const walk = (el: Element) => {
    for (const child of Array.from(el.children)) {
      if (!KEEP.has(child.tagName)) {
        // drop dangerous elements whole; unwrap harmless unknown ones so their text survives
        if (/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED|FRAME|FRAMESET|META|LINK|BASE|FORM|INPUT|BUTTON|TEXTAREA|SELECT|SVG|MATH|TEMPLATE|NOSCRIPT)$/.test(child.tagName)) { child.remove(); continue; }
        walk(child); child.replaceWith(...Array.from(child.childNodes)); continue;
      }
      for (const a of Array.from(child.attributes)) {
        const name = a.name.toLowerCase(), val = a.value.trim().toLowerCase();
        if (!ATTRS.has(name)) child.removeAttribute(a.name);
        else if ((name === "href" || name === "src") && !/^(https?:|mailto:|cid:|#|\/)/.test(val) && !(name === "src" && /^data:image\/(png|jpe?g|gif|webp);/.test(val))) child.removeAttribute(a.name);
        else if (name === "style" && /expression|javascript:|url\s*\(/.test(val)) child.removeAttribute(a.name);
      }
      walk(child);
    }
  };
  walk(doc.body);
  return doc.body.innerHTML;
}
