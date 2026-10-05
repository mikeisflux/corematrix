"use client";
import { FOLDERS, type Counts, type FolderId } from "./types";
const COLOR: Record<string, string> = { hot: "var(--primary)", bad: "var(--heat-6)", dim: "var(--text-faint)" };
export default function Folders({ folder, counts, onPick }: { folder: FolderId; counts?: Counts; onPick: (f: FolderId) => void }) {
  return (
    <nav className="admMail__folders" aria-label="Folders">
      {FOLDERS.map((f) => { const n = counts?.[f.id]; return (
        <button key={f.id} type="button" className={folder === f.id ? "on" : ""} onClick={() => onPick(f.id)}>
          <span>{f.label}</span>{n ? <span style={{ color: COLOR[f.countKind || "dim"] }}>{n > 999 ? "999+" : n}</span> : null}
        </button>
      ); })}
    </nav>
  );
}
