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
  const upload = async (file: File) => {
    const duration = await probeDuration(URL.createObjectURL(file));
    setProgress({ name: file.name, pct: 0 });
    await new Promise<void>((resolve) => {
      const xhr = new XMLHttpRequest();
      const q = new URLSearchParams({ name: file.name, type: file.type, duration: String(duration), size: String(file.size) });
      xhr.open("PUT", `/api/admin/theater/upload?${q}`);
      xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) setProgress({ name: file.name, pct: Math.round((e.loaded / e.total) * 100) }); };
      xhr.onload = () => { if (xhr.status >= 200 && xhr.status < 300) toast.ok(`${file.name} is in the playlist`); else { let m = "Upload failed"; try { m = JSON.parse(xhr.responseText).error || m; } catch {} toast.err(m); } resolve(); };
      xhr.onerror = () => { toast.err("Upload failed (network)"); resolve(); };
      xhr.send(file);
    });
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
          <p className="admMuted" style={{ fontSize: 12 }}>Browsers play H.264 MP4 everywhere; a 1080p file at 5–8 Mbps looks sharp on the 34 ft screen. Keep the tab open until the bar finishes.</p>
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
