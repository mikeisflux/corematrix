"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useJson, api, useToast, qs } from "./shared";
import InboxReader from "./InboxReader";
import Compose from "./Compose";
import Folders from "./inbox/Folders";
import Toolbar from "./inbox/Toolbar";
import MessageList from "./inbox/MessageList";
import { useInboxKeys } from "./inbox/useInboxKeys";
import { FOLDERS, isDraft, replyPrefill, type BulkAction, type ComposePrefill, type FolderId, type FullMsg, type ListData, type MsgRow } from "./inbox/types";

export type { MsgRow } from "./inbox/types";
export interface InitialCompose { draftId: string | null; to: string; cc: string; bcc: string; subject: string; threadId: string; quote: string }
const PAGE_SIZE = 50;
const BULK_DONE: Record<BulkAction, string> = { read: "marked read", unread: "marked unread", star: "starred", unstar: "unstarred", archive: "archived", unarchive: "unarchived", delete: "deleted" };
const POLL_MS = 30_000;
const validFolder = (f: string): FolderId => (FOLDERS.some((x) => x.id === f) ? (f as FolderId) : "inbox");

export default function Inbox({ initialId, initialFolder, initialCompose }: { initialId: string | null; initialFolder: string; initialCompose?: InitialCompose | null }) {
  const [folder, setFolderState] = useState<FolderId>(validFolder(initialFolder));
  const [qDraft, setQDraft] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState<string | null>(initialId);
  const [cursor, setCursor] = useState(-1);
  const [checked, setChecked] = useState<Set<string>>(() => new Set());
  const [auto, setAutoState] = useState(true);
  const [mobileRead, setMobileRead] = useState(!!initialId);
  const [compose, setCompose] = useState<ComposePrefill | null>(initialCompose ? { ...initialCompose } : null);
  const [composeKey, setComposeKey] = useState(0);
  const lastCheck = useRef<number>(-1);
  const searchRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const toastRef = useRef(toast); toastRef.current = toast;
  const list = useJson<ListData>(`/api/admin/emails?${qs({ folder, q, page, pageSize: PAGE_SIZE })}`);
  const rows = useMemo(() => list.data?.rows ?? [], [list.data]);
  const reload = list.reload;

  useEffect(() => { const t = setTimeout(() => { setQ(qDraft.trim()); setPage(1); }, 350); return () => clearTimeout(t); }, [qDraft]);
  useEffect(() => { try { const v = localStorage.getItem("adm.mail.auto"); if (v !== null) setAutoState(v === "1"); } catch {} }, []);
  const setAuto = (v: boolean) => { setAutoState(v); try { localStorage.setItem("adm.mail.auto", v ? "1" : "0"); } catch {} };
  useEffect(() => {
    if (!auto) return;
    const tick = () => { if (document.visibilityState === "visible") reload(); };
    const t = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", tick); };
  }, [auto, reload]);
  useEffect(() => {
    const p = new URLSearchParams();
    if (folder !== "inbox") p.set("folder", folder);
    if (sel) p.set("id", sel);
    window.history.replaceState(null, "", `/admin/emails${p.size ? `?${p}` : ""}`);
  }, [folder, sel]);

  const setFolder = (f: FolderId) => { setFolderState(f); setPage(1); setCursor(-1); setChecked(new Set()); setMobileRead(false); };
  const mutate = useCallback((ids: string[], d: Partial<MsgRow>) => list.setData((cur) => cur ? { ...cur, rows: cur.rows.map((r) => ids.includes(r.id) ? { ...r, ...d } : r) } : cur), [list.setData]);
  const patch = useCallback(async (id: string, d: Record<string, boolean>) => {
    mutate([id], d);
    try { await api(`/api/admin/emails/${id}`, { method: "PATCH", json: d }); reload(); } catch (e) { toastRef.current.err(e); reload(); }
  }, [mutate, reload]);
  const openCompose = useCallback((p: ComposePrefill) => { setCompose(p); setComposeKey((k) => k + 1); }, []);
  const open = useCallback((m: MsgRow) => {
    if (isDraft(m)) { openCompose({ draftId: m.id }); return; }
    setSel(m.id); setMobileRead(true); setCursor(rows.findIndex((r) => r.id === m.id));
  }, [rows, openCompose]);
  const star = useCallback((m: MsgRow) => { patch(m.id, { starred: !m.starred }); toastRef.current.ok(m.starred ? "Unstarred" : "Starred"); }, [patch]);
  const archive = useCallback((m: MsgRow) => { patch(m.id, { archived: !m.archived }); toastRef.current.ok(m.archived ? "Unarchived" : "Archived"); }, [patch]);
  const del = useCallback(async (id: string) => {
    try { await api(`/api/admin/emails/${id}`, { method: "DELETE" }); if (sel === id) { setSel(null); setMobileRead(false); } reload(); toastRef.current.ok("Deleted"); } catch (e) { toastRef.current.err(e); }
  }, [sel, reload]);
  const resend = useCallback(async (id: string) => {
    try { const r = await api<{ logId?: string }>(`/api/admin/emails/${id}`, { method: "POST", json: { action: "resend" } }); toastRef.current.ok("Resent"); reload(); if (r.logId) setSel(r.logId); } catch (e) { toastRef.current.err(e); }
  }, [reload]);
  const replyTo = useCallback(async (id: string) => {
    try { const d = await api<{ row: FullMsg; me: string }>(`/api/admin/emails/${id}`); if (isDraft(d.row)) openCompose({ draftId: id }); else openCompose(replyPrefill(d.row, false, d.me)); } catch (e) { toastRef.current.err(e); }
  }, [openCompose]);

  const bulk = async (action: BulkAction) => {
    const ids = [...checked];
    if (!ids.length) return;
    try {
      await api("/api/admin/emails/bulk", { method: "POST", json: { ids, action } });
      if (action === "delete" && sel && ids.includes(sel)) { setSel(null); setMobileRead(false); }
      setChecked(new Set()); reload(); toast.ok(`${ids.length} ${BULK_DONE[action]}`);
    } catch (e) { toast.err(e); }
  };
  const check = (id: string, shift: boolean) => {
    const i = rows.findIndex((r) => r.id === id);
    setChecked((cur) => {
      const next = new Set(cur);
      if (shift && lastCheck.current >= 0 && i >= 0) { const [a, b] = [Math.min(lastCheck.current, i), Math.max(lastCheck.current, i)]; for (let k = a; k <= b; k++) next.add(rows[k].id); }
      else if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    lastCheck.current = i;
  };
  const allChecked = rows.length > 0 && rows.every((r) => checked.has(r.id));
  const toggleAll = () => setChecked(allChecked ? new Set() : new Set(rows.map((r) => r.id)));
  const target = cursor >= 0 ? rows[cursor] : rows.find((r) => r.id === sel);
  const keys = useMemo(() => ({
    j: () => setCursor((c) => Math.min(c + 1, rows.length - 1)), k: () => setCursor((c) => Math.max(c - 1, 0)),
    enter: () => { if (target) open(target); }, e: () => { if (target) archive(target); }, s: () => { if (target) star(target); },
    r: () => { const id = sel || target?.id; if (id) replyTo(id); }, c: () => openCompose({}), slash: () => searchRef.current?.focus(),
    escape: () => { if (mobileRead) setMobileRead(false); else if (checked.size) setChecked(new Set()); },
  }), [rows, target, sel, open, archive, star, replyTo, openCompose, mobileRead, checked.size]);
  useInboxKeys(keys, !compose);
  const onSent = (logId: string) => { reload(); if (folder === "sent" || folder === "all") setSel(logId); };

  return (
    <>
      {toast.node}
      <div className="admHead">
        <div><h1 className="admH1">Mail</h1><p>Inbound mail (SendGrid Inbound Parse), outbound log, drafts. Replies thread with the original and send through SendGrid.</p></div>
        <div className="admRow"><span className="admLabel admMail__keys">j/k move · enter open · e archive · s star · r reply · c compose · / search</span></div>
      </div>
      <div className={`admMail${mobileRead && sel ? " admMail--read" : ""}`}>
        <Toolbar onCompose={() => openCompose({})} onRefresh={reload} loading={list.loading} auto={auto} setAuto={setAuto} q={qDraft} setQ={setQDraft} searchRef={searchRef}
          allChecked={allChecked} someChecked={checked.size > 0} onToggleAll={toggleAll} selected={checked.size} onBulk={bulk} total={list.data?.total} />
        <Folders folder={folder} counts={list.data?.counts} onPick={setFolder} />
        <MessageList rows={rows} sel={sel} cursor={cursor} checked={checked} loading={list.loading} error={list.error} page={page} pages={list.data?.pages ?? 1} onPage={(p) => { setPage(p); setCursor(-1); }} onOpen={open} onCheck={check} onStar={star} />
        <section className="admMail__read" aria-label="Message">
          {sel
            ? <InboxReader key={sel} id={sel} onChange={reload} onDelete={() => del(sel)} onSelect={(id) => { setSel(id); setMobileRead(true); }} onBack={() => setMobileRead(false)} patch={patch} onCompose={openCompose} onResend={resend} />
            : <div className="admEmpty" style={{ padding: 24 }}>Select a message, or press <span className="admMono">c</span> to compose.</div>}
        </section>
      </div>
      {compose && <Compose key={composeKey} prefill={compose} onClose={() => setCompose(null)} onSent={onSent} toast={toast} />}
    </>
  );
}
