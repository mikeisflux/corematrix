"use client";
import type { RefObject } from "react";
import type { BulkAction } from "./types";
export interface ToolbarProps {
  onCompose: () => void; onRefresh: () => void; loading: boolean; auto: boolean; setAuto: (v: boolean) => void;
  q: string; setQ: (v: string) => void; searchRef: RefObject<HTMLInputElement | null>;
  allChecked: boolean; someChecked: boolean; onToggleAll: () => void; selected: number; onBulk: (a: BulkAction) => void; total?: number;
}
export default function Toolbar(p: ToolbarProps) {
  return (
    <div className="admMail__bar">
      <button type="button" className="admBtn admBtn--sm admBtn--primary" onClick={p.onCompose} title="Compose (c)">Compose</button>
      <button type="button" className="admBtn admBtn--sm" onClick={p.onRefresh} disabled={p.loading} title="Refresh">{p.loading ? <span className="admSpin" aria-hidden /> : null}{p.loading ? "Loading" : "Refresh"}</button>
      <label className="admCheck admMail__auto" title="Poll every 30s while this tab is visible"><input type="checkbox" checked={p.auto} onChange={(e) => p.setAuto(e.target.checked)} /> Auto</label>
      <input ref={p.searchRef} className="admInput admInput--sm grow" type="search" placeholder="Search  (/)" value={p.q} onChange={(e) => p.setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") { p.setQ(""); (e.target as HTMLInputElement).blur(); } }} />
      <label className="admCheck" title="Select all on this page"><input type="checkbox" checked={p.allChecked} ref={(el) => { if (el) el.indeterminate = p.someChecked && !p.allChecked; }} onChange={p.onToggleAll} /> All</label>
      {p.selected > 0 && (
        <div className="admRow admMail__bulk">
          <span className="admLabel">{p.selected} selected</span>
          <button type="button" className="admBtn admBtn--sm" onClick={() => p.onBulk("read")}>Read</button>
          <button type="button" className="admBtn admBtn--sm" onClick={() => p.onBulk("unread")}>Unread</button>
          <button type="button" className="admBtn admBtn--sm" onClick={() => p.onBulk("star")}>Star</button>
          <button type="button" className="admBtn admBtn--sm" onClick={() => p.onBulk("unstar")}>Unstar</button>
          <button type="button" className="admBtn admBtn--sm" onClick={() => p.onBulk("archive")}>Archive</button>
          <button type="button" className="admBtn admBtn--sm" onClick={() => p.onBulk("unarchive")}>Unarchive</button>
          <button type="button" className="admBtn admBtn--sm admBtn--danger" onClick={() => { if (window.confirm(`Delete ${p.selected} message(s)?`)) p.onBulk("delete"); }}>Delete</button>
        </div>
      )}
      {p.selected === 0 && p.total !== undefined && <span className="admLabel">{p.total} total</span>}
    </div>
  );
}
