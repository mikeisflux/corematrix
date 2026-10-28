"use client";
/** Admin → Theater: upload films to the server, order the playlist, caption the screen. */
import { useEffect, useRef, useState } from "react";
import { useJson, api, useToast, PageHead, Badge, Empty, Input, ConfirmButton } from "./shared";
import { scheduleAt } from "@/lib/theater-schedule";

interface Row { id: string; title: string; kind: "file" | "url"; src: string; mime: string | null; bytes: number; duration: number; position: number; enabled: number; createdAt: number }
interface Resp { rows: Row[]; title: string; dir: string; maxBytes: number }

const fmtDur = (s: number) => (s > 0 ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}` : "?");
const fmtBytes = (b: number) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(2)} GB` : b >= 1024 ** 2 ? `${(b / 1024 ** 2).toFixed(0)} MB` : b > 0 ? `${Math.round(b / 1024)} KB` : "");
/** Reads a video's length in the browser before upload (or for a URL), so the screen can keep everyone in sync. */
function probeDuration(src: string): Promise<number> {
  return new Promise((res) => {
    const v = document.createElement("video"); v.preload = "metadata"; v.muted = true;
    const done = (n: number) => { v.removeAttribute("src"); v.load(); res(n); };
    const t = setTimeout(() => done(0), 15000);
    v.onloadedmetadata = () => { clearTimeout(t); done(Number.isFinite(v.duration) ? v.duration : 0); };
    v.onerror = () => { clearTimeout(t); done(0); };
    v.src = src;
  });
}

export default function Theater() {
  const list = useJson<Resp>("/api/admin/theater");
  const toast = useToast();
  const [title, setTitle] = useState<string | null>(null);
  const [url, setUrl] = useState(""); const [urlTitle, setUrlTitle] = useState("");
  const [progress, setProgress] = useState<{ name: string; pct: number } | null>(null);
  const [tick, setTick] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 1000); return () => clearInterval(t); }, []);
  const rows = list.data?.rows ?? [];
  const enabled = rows.filter((r) => r.enabled);
  const total = enabled.reduce((a, r) => a + r.duration, 0);
  const sched = enabled.length ? scheduleAt(enabled, Date.now() / 1000) : null;
  void tick;

  const saveTitle = async () => {
    try { await api("/api/admin/settings", { method: "PUT", json: { key: "THEATER_TITLE", value: title ?? "" } }); toast.ok("Caption saved"); list.reload(); }
    catch (e) { toast.err((e as Error).message); }
  };
  // Resumable upload: 8 MB chunks, each retried on its own; the upload id is remembered per file so picking the same
  // file again after a drop or a reload only sends the chunks that are still missing.
  const upload = async (file: File) => {
    const key = `fcc_upload:${file.name}:${file.size}:${file.lastModified}`;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    let id: string | null = null, chunkBytes = 8 * 1024 * 1024, chunks = 0;
    const have = new Set<number>();
    try { id = localStorage.getItem(key); } catch {}
    if (id) {
      try { const st = await api<{ chunkBytes: number; chunks: number; received: number[] }>(`/api/admin/theater/upload/status?id=${id}`); chunkBytes = st.chunkBytes; chunks = st.chunks; st.received.forEach((i) => have.add(i)); }
      catch { id = null; }
    }
    setProgress({ name: file.name, pct: 0 });
    if (!id) {
      const duration = await probeDuration(URL.createObjectURL(file));
      try {
        const r = await api<{ id: string; chunkBytes: number; chunks: number }>("/api/admin/theater/upload/init", { method: "POST", json: { name: file.name, type: file.type, size: file.size, duration } });
        id = r.id; chunkBytes = r.chunkBytes; chunks = r.chunks;
        try { localStorage.setItem(key, id); } catch {}
      } catch (e) { toast.err((e as Error).message); setProgress(null); return; }
    }
    const done = () => have.size;
    setProgress({ name: file.name, pct: Math.round((done() / chunks) * 100) });
    for (let i = 0; i < chunks; i++) {
      if (have.has(i)) continue;
      const blob = file.slice(i * chunkBytes, Math.min(file.size, (i + 1) * chunkBytes));
      let ok = false;
      for (let attempt = 0; attempt < 10 && !ok; attempt++) {
        try {
          const r = await fetch(`/api/admin/theater/upload/chunk?id=${id}&index=${i}`, { method: "PUT", body: blob, headers: { "Content-Type": "application/octet-stream" } });
          if (r.status === 404) { toast.err("The server forgot this upload; starting it again"); try { localStorage.removeItem(key); } catch {} setProgress(null); return upload(file); }
          if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `chunk ${i} failed (${r.status})`);
          ok = true;
        } catch { await sleep(Math.min(15000, 1000 * 2 ** attempt)); }
      }
      if (!ok) { toast.err(`Upload paused at ${Math.round((done() / chunks) * 100)}%: check the connection and pick the same file again to resume.`); setProgress(null); return; }
      have.add(i);
      setProgress({ name: file.name, pct: Math.round((done() / chunks) * 100) });
    }
    try {
      await api("/api/admin/theater/upload/complete", { method: "POST", json: { id } });
      try { localStorage.removeItem(key); } catch {}
      toast.ok(`${file.name} is in the playlist`);
    } catch (e) { toast.err((e as Error).message); }
    setProgress(null); list.reload();
  };
  const onFiles = async (files: FileList | null) => { if (!files) return; for (const f of Array.from(files)) await upload(f); if (fileInput.current) fileInput.current.value = ""; };
  const addUrl = async () => {
    try { const duration = await probeDuration(url); await api("/api/admin/theater", { method: "POST", json: { url, title: urlTitle || undefined, duration } }); toast.ok(duration ? "Added" : "Added (length unknown: the screen will give it a 10 minute turn)"); setUrl(""); setUrlTitle(""); list.reload(); }
    catch (e) { toast.err((e as Error).message); }
  };
  const patch = async (id: string, body: Record<string, unknown>) => { try { await api(`/api/admin/theater/${id}`, { method: "PATCH", json: body }); list.reload(); } catch (e) { toast.err((e as Error).message); } };
  const move = async (i: number, dir: -1 | 1) => {
    const ids = rows.map((r) => r.id); const j = i + dir; if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    try { await api("/api/admin/theater", { method: "PATCH", json: { order: ids } }); list.reload(); } catch (e) { toast.err((e as Error).message); }
  };
  const remove = async (id: string) => { try { await api(`/api/admin/theater/${id}`, { method: "DELETE" }); toast.ok("Removed"); list.reload(); } catch (e) { toast.err((e as Error).message); } };

  return (
    <>
      {toast.node}
      <PageHead title="Theater" sub="The big screen on the arcade stage. Films play in this order and loop; everyone in the hall sees the same moment, muted until a visitor near the screen taps for sound. Uploads stream straight to the server's disk, so a feature-length file is fine.">
        <button className="admBtn" onClick={list.reload}>Refresh</button>
      </PageHead>
      <div className="admGrid">
        <div className="admTile"><div className="admLabel">In the playlist</div><div className="admTile__n">{enabled.length}</div><div className="admTile__sub">{rows.length - enabled.length ? `${rows.length - enabled.length} switched off` : "all on"}</div></div>
        <div className="admTile"><div className="admLabel">Loop length</div><div className="admTile__n">{fmtDur(total)}</div><div className="admTile__sub">{enabled.some((r) => !(r.duration > 0)) ? "some lengths unknown" : "then it starts over"}</div></div>
        <div className="admTile" style={{ ["--c" as string]: "var(--heat-1)" }}><div className="admLabel">On screen now</div><div className="admTile__n" style={{ fontSize: 20 }}>{sched ? enabled[sched.index]?.title : "poster"}</div><div className="admTile__sub">{sched && sched.offset >= 0 ? `${fmtDur(sched.offset)} in` : enabled.length ? "" : "add a film to start the show"}</div></div>
        <div className="admTile"><div className="admLabel">Storage</div><div className="admTile__n" style={{ fontSize: 20 }}>{fmtBytes(rows.reduce((a, r) => a + r.bytes, 0)) || "0"}</div><div className="admTile__sub admMono" style={{ fontSize: 11, wordBreak: "break-all" }}>{list.data?.dir}</div></div>
      </div>
      <div className="admSplit">
        <div className="admCard">
          <div className="admCard__hd"><b>Upload a film</b><span className="admMuted">MP4 (H.264/AAC) or WebM · up to {list.data ? Math.round(list.data.maxBytes / 1024 ** 3) : 4} GB each</span></div>
          <input ref={fileInput} type="file" accept="video/mp4,video/webm,video/quicktime,video/x-m4v" multiple onChange={(e) => void onFiles(e.target.files)} disabled={!!progress} />
          {progress && (
            <div>
              <div className="admMuted" style={{ fontSize: 12 }}>Uploading {progress.name} · {progress.pct}%</div>
              <div style={{ height: 6, background: "var(--surface-2)", border: "1px solid var(--rule)" }}><div style={{ height: "100%", width: `${progress.pct}%`, background: "var(--heat-1)" }} /></div>
            </div>
          )}
          <p className="admMuted" style={{ fontSize: 12 }}>Browsers play H.264 MP4 everywhere. Encode at 720p or 1080p, 4–8 Mbps: every frame is copied onto the 3D screen, so a 4K file makes it stutter and gains nothing on a 32 ft screen seen from the benches. Uploads go up in 8 MB pieces and resume: if the connection drops or the tab closes, pick the same file again and it continues from where it stopped.</p>
        </div>
        <div className="admCard">
          <div className="admCard__hd"><b>Add by link</b><span className="admMuted">a direct .mp4/.webm address</span></div>
          <Input placeholder="https://cdn.example.com/trailer.mp4" value={url} onChange={(e) => setUrl(e.target.value)} />
          <Input placeholder="Title (optional)" value={urlTitle} onChange={(e) => setUrlTitle(e.target.value)} />
          <div className="admRow"><button className="admBtn admBtn--primary" disabled={!url.trim()} onClick={() => void addUrl()}>Add to playlist</button></div>
          <p className="admMuted" style={{ fontSize: 12 }}>The host must allow cross-origin use (CORS) or the screen stays black for that item; YouTube and Vimeo pages do not work, only direct files. Uploading is the sure way.</p>
        </div>
      </div>
      <div className="admCard">
        <div className="admCard__hd">
          <b>Now showing caption</b>
          <div className="admRow"><Input style={{ minWidth: 280 }} value={title ?? list.data?.title ?? ""} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Divinity Comics trailers" /><button className="admBtn admBtn--primary" onClick={() => void saveTitle()} disabled={title === null}>Save</button></div>
        </div>
        <p className="admMuted" style={{ fontSize: 12 }}>Shown on the pill in the hall while the screen plays, next to the sound toggle.</p>
      </div>
      <div className="admCard">
        <div className="admCard__hd"><b>Playlist</b><span className="admMuted">plays top to bottom, then loops</span></div>
        {list.error && <div className="admNote admNote--err">{list.error}</div>}
        {list.data && rows.length === 0 && <Empty>No films yet. Upload one above; the screen shows a poster until then.</Empty>}
        {rows.length > 0 && (
          <div className="admTableWrap"><table className="admTable">
            <thead><tr><th>#</th><th>Title</th><th>Source</th><th className="num">Length</th><th className="num">Size</th><th>On</th><th></th></tr></thead>
            <tbody>{rows.map((r, i) => (
              <tr key={r.id} className={sched && enabled[sched.index]?.id === r.id ? "sel" : ""}>
                <td className="admMono">{i + 1}{sched && enabled[sched.index]?.id === r.id && <> <Badge kind="ok">on screen</Badge></>}</td>
                <td><input className="admInput" style={{ minWidth: 220 }} defaultValue={r.title} onBlur={(e) => { if (e.target.value !== r.title) void patch(r.id, { title: e.target.value }); }} /></td>
                <td>{r.kind === "file" ? <><Badge kind="info">upload</Badge> <a href={`/api/theater/file/${r.id}`} target="_blank" rel="noreferrer">play</a></> : <><Badge kind="dim">link</Badge> <a href={r.src} target="_blank" rel="noreferrer" className="admMono" style={{ fontSize: 11 }}>{r.src.slice(0, 48)}{r.src.length > 48 ? "…" : ""}</a></>}</td>
                <td className="num">{fmtDur(r.duration)}</td>
                <td className="num">{fmtBytes(r.bytes)}</td>
                <td><input type="checkbox" checked={!!r.enabled} onChange={(e) => void patch(r.id, { enabled: e.target.checked })} /></td>
                <td className="act">
                  <button className="admBtn admBtn--sm" disabled={i === 0} onClick={() => void move(i, -1)} title="Earlier">↑</button>{" "}
                  <button className="admBtn admBtn--sm" disabled={i === rows.length - 1} onClick={() => void move(i, 1)} title="Later">↓</button>{" "}
                  <ConfirmButton className="admBtn admBtn--sm" message={`Remove "${r.title}"${r.kind === "file" ? " and delete the file from the server" : ""}?`} onConfirm={() => remove(r.id)}>Remove</ConfirmButton>
                </td>
              </tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
    </>
  );
}
