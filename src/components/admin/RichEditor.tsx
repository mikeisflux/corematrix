"use client";
import { useEffect, useRef, useState } from "react";
const VARS = ["name", "email", "boothName", "boothId", "amount", "price", "payout", "profit", "planName", "periodEnd", "link", "siteName", "siteUrl", "supportEmail", "currentYear"];
/* contentEditable HTML editor with a raw-HTML toggle. `value` is HTML. */
export default function RichEditor({ value, onChange, minHeight = 260, allowRaw = true }: { value: string; onChange: (html: string) => void; minHeight?: number; allowRaw?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [raw, setRaw] = useState(false);
  const last = useRef(value);
  useEffect(() => {
    if (raw || !ref.current) return;
    if (value !== last.current || ref.current.innerHTML === "") { ref.current.innerHTML = value || ""; last.current = value; }
  }, [value, raw]);
  const emit = () => { if (!ref.current) return; last.current = ref.current.innerHTML; onChange(last.current); };
  const cmd = (name: string, arg?: string) => { ref.current?.focus(); document.execCommand(name, false, arg); emit(); };
  const insertHtml = (html: string) => { ref.current?.focus(); document.execCommand("insertHTML", false, html); emit(); };
  return (
    <div className="admEditor">
      <div className="admEditor__bar" onMouseDown={(e) => e.preventDefault()}>
        {!raw && (<>
          <button type="button" title="Bold" onClick={() => cmd("bold")}><b>B</b></button>
          <button type="button" title="Italic" onClick={() => cmd("italic")}><i>I</i></button>
          <button type="button" title="Underline" onClick={() => cmd("underline")}><u>U</u></button>
          <button type="button" title="Heading" onClick={() => cmd("formatBlock", "<h2>")}>H2</button>
          <button type="button" title="Paragraph" onClick={() => cmd("formatBlock", "<p>")}>¶</button>
          <button type="button" title="Bullet list" onClick={() => cmd("insertUnorderedList")}>• List</button>
          <button type="button" title="Numbered list" onClick={() => cmd("insertOrderedList")}>1. List</button>
          <button type="button" title="Quote" onClick={() => cmd("formatBlock", "<blockquote>")}>“ ”</button>
          <button type="button" title="Link" onClick={() => { const u = window.prompt("Link URL", "https://"); if (u) cmd("createLink", u); }}>Link</button>
          <button type="button" title="Image by URL" onClick={() => { const u = window.prompt("Image URL", "https://"); if (u) insertHtml(`<img src="${u.replace(/"/g, "&quot;")}" alt="" style="max-width:100%">`); }}>Image</button>
          <button type="button" title="Horizontal rule" onClick={() => cmd("insertHorizontalRule")}>—</button>
          <button type="button" title="Clear formatting" onClick={() => cmd("removeFormat")}>Clear</button>
          <select defaultValue="" onChange={(e) => { if (e.target.value) insertHtml(`{{${e.target.value}}}`); e.target.value = ""; }} title="Insert template variable">
            <option value="">{"{{var}}"}</option>
            {VARS.map((v) => <option key={v} value={v}>{`{{${v}}}`}</option>)}
          </select>
        </>)}
        {allowRaw && <button type="button" style={{ marginLeft: "auto" }} className={raw ? "on" : ""} onClick={() => setRaw((r) => !r)}>{raw ? "Visual" : "HTML"}</button>}
      </div>
      {raw ? (
        <textarea className="admInput admInput--mono" style={{ minHeight }} value={value} onChange={(e) => { last.current = e.target.value; onChange(e.target.value); }} spellCheck={false} />
      ) : (
        <div ref={ref} className="admEditor__body" style={{ minHeight }} contentEditable suppressContentEditableWarning onInput={emit} onBlur={emit}
          onPaste={(e) => { const t = e.clipboardData.getData("text/html") || e.clipboardData.getData("text/plain").replace(/\n/g, "<br>"); if (t) { e.preventDefault(); insertHtml(t); } }} />
      )}
    </div>
  );
}
