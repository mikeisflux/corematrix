"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/* ───────── fetch helpers ───────── */
export async function api<T = Record<string, unknown>>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(url, {
    ...rest,
    headers: json !== undefined ? { "Content-Type": "application/json", ...(rest.headers || {}) } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `HTTP ${res.status}`);
  return data as T;
}

export function useJson<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    if (!url) { setLoading(false); return; }
    setLoading(true);
    try { setData(await api<T>(url)); setError(null); }
    catch (e) { setError(String((e as Error).message || e)); }
    finally { setLoading(false); }
  }, [url]);
  useEffect(() => { reload(); }, [reload]);
  return { data, error, loading, reload, setData };
}

/* ───────── toast ───────── */
export function useToast() {
  const [toast, setToast] = useState<{ text: string; kind: "ok" | "err" | "" } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback((text: string, kind: "ok" | "err" | "" = "") => {
    setToast({ text, kind });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 3500);
  }, []);
  const ok = useCallback((t: string) => show(t, "ok"), [show]);
  const err = useCallback((e: unknown) => show(e instanceof Error ? e.message : String(e), "err"), [show]);
  const node = toast ? <div className={`admToast${toast.kind ? ` admToast--${toast.kind}` : ""}`}>{toast.text}</div> : null;
  return { show, ok, err, node };
}

/* ───────── display bits ───────── */
const STATUS_KIND: Record<string, string> = {
  paid: "ok", active: "ok", delivered: "ok", opened: "ok", clicked: "ok", processed: "ok", sent: "info", published: "ok", landmark: "hot", pro: "info",
  pending: "warn", awaiting_payment: "warn", past_due: "warn", queued: "warn", received: "warn", canceling: "warn", ignored: "dim",
  cancelled: "bad", canceled: "bad", refunded: "bad", failed: "bad", bounced: "bad", spam: "bad", disputed: "bad", expired: "dim", ended: "dim", inactive: "dim", hidden: "dim", free: "dim",
};
export function Badge({ children, kind }: { children: React.ReactNode; kind?: string }) {
  const k = kind ?? STATUS_KIND[String(children ?? "").toLowerCase()] ?? "";
  return <span className={`admBadge${k ? ` admBadge--${k}` : ""}`}>{children}</span>;
}
export function Money({ cents, currency = "USD" }: { cents: number | null | undefined; currency?: string }) {
  const v = Number(cents ?? 0) / 100;
  return <span className="admMono">{new Intl.NumberFormat("en-US", { style: "currency", currency }).format(v)}</span>;
}
export const fmtMoney = (cents: number | null | undefined, currency = "USD") => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(cents ?? 0) / 100);
export function DateTime({ value, dateOnly }: { value: string | number | Date | null | undefined; dateOnly?: boolean }) {
  if (!value) return <span className="admMuted">—</span>;
  const d = new Date(value);
  return <span className="admMono" title={d.toISOString()}>{dateOnly ? d.toLocaleDateString() : d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</span>;
}
export function ConfirmButton({ onConfirm, message = "Are you sure?", children, className = "admBtn", disabled }: { onConfirm: () => void | Promise<void>; message?: string; children: React.ReactNode; className?: string; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" className={className} disabled={busy || disabled} onClick={async () => { if (!window.confirm(message)) return; setBusy(true); try { await onConfirm(); } finally { setBusy(false); } }}>{busy ? "…" : children}</button>
  );
}
export function Pager({ page, pages, total, onPage }: { page: number; pages: number; total?: number; onPage: (p: number) => void }) {
  if (pages <= 1 && !total) return null;
  return (
    <div className="admPager">
      {total !== undefined && <span>{total} total</span>}
      <button className="admBtn admBtn--sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Prev</button>
      <span>{page} / {Math.max(pages, 1)}</span>
      <button className="admBtn admBtn--sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</button>
    </div>
  );
}
export function SearchBox({ value, onChange, placeholder = "Search…" }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [v, setV] = useState(value);
  useEffect(() => { setV(value); }, [value]);
  useEffect(() => { const t = setTimeout(() => { if (v !== value) onChange(v); }, 350); return () => clearTimeout(t); }, [v, value, onChange]);
  return <input className="admInput admInput--sm" type="search" value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} />;
}

/* ───────── form primitives ───────── */
export function Field({ label, children, hint, className = "" }: { label: string; children: React.ReactNode; hint?: string; className?: string }) {
  return <div className={`admField ${className}`}><label>{label}</label>{children}{hint && <span className="admHint">{hint}</span>}</div>;
}
export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) { return <input {...props} className={`admInput ${props.className || ""}`} />; }
export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea {...props} className={`admInput ${props.className || ""}`} />; }
export function Select({ options, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { options: (string | { value: string; label: string })[] }) {
  return (
    <select {...props} className={`admInput ${props.className || ""}`}>
      {options.map((o) => typeof o === "string" ? <option key={o} value={o}>{o || "—"}</option> : <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}
export function Checkbox({ label, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return <label className="admCheck"><input type="checkbox" {...props} /> {label}</label>;
}
export function PageHead({ title, children, sub }: { title: string; children?: React.ReactNode; sub?: string }) {
  return <div className="admHead"><div><h1 className="admH1">{title}</h1>{sub && <p>{sub}</p>}</div>{children && <div className="admRow">{children}</div>}</div>;
}
export function Empty({ children = "Nothing here yet." }: { children?: React.ReactNode }) { return <div className="admEmpty">{children}</div>; }
export const qs = (o: Record<string, string | number | undefined | null>) =>
  Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join("&");
export function csvDownload(filename: string, text: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
  a.download = filename;
  a.click();
}
