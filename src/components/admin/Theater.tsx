"use client";
/** Admin → Theater: upload films to the server, order the playlist, caption the screen. */
import { useEffect, useRef, useState } from "react";
import { useJson, api, useToast, PageHead, Badge, Empty, Input, ConfirmButton } from "./shared";
import { scheduleAt } from "@/lib/theater-schedule";

interface Row { id: string; title: string; kind: "file" | "url"; src: string; mime: string | null; bytes: number; duration: number; position: number; enabled: number; status: string; createdAt: number }
interface Resp { rows: Row[]; title: string; dir: string; maxBytes: number; encoder: boolean; target: { height: number; kbps: number }; encoding: string | null; queued: string[] }

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
  const [progress, setProgress] = useState<{ name: string; pct: number; rate?: number; eta?: number | null } | null>(null);
  const [tick, setTick] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 1000); return () => clearInterval(t); }, []);
  const rows = list.data?.rows ?? [];
  const enabled = rows.filter((r) => r.enabled && r.status === "ready");
  const processing = rows.some((r) => r.status === "processing");
  useEffect(() => { if (!processing) return; const t = setInterval(list.reload, 10000); return () => clearInterval(t); }, [processing, list.reload]);
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
    // four chunks in flight at once to fill the connection; byte-level progress from each request so the bar never looks stuck
    const sent = new Map<number, number>();
    const startedAt = Date.now(); let doneBytes = have.size * chunkBytes;
    const report = () => {
      const bytes = Math.min(file.size, doneBytes + Array.from(sent.values()).reduce((a, b) => a + b, 0));
      const secs = (Date.now() - startedAt) / 1000; const rate = secs > 1 ? (bytes - have.size * chunkBytes) / secs : 0;
      const eta = rate > 0 ? Math.max(0, Math.round((file.size - bytes) / rate)) : null;
      setProgress({ name: file.name, pct: Math.round((bytes / file.size) * 100), rate, eta });
    };
    report();
    const putChunk = (i: number) => new Promise<"ok" | "gone" | "fail">((resolve) => {
      const blob = file.slice(i * chunkBytes, Math.min(file.size, (i + 1) * chunkBytes));
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", `/api/admin/theater/upload/chunk?id=${id}&index=${i}`);
      xhr.setRequestHeader("Content-Type", "application/octet-stream");
      xhr.timeout = 180000;
      xhr.upload.onprogress = (e) => { sent.set(i, e.loaded); report(); };
      xhr.onload = () => { sent.delete(i); if (xhr.status >= 200 && xhr.status < 300) { doneBytes += blob.size; resolve("ok"); } else resolve(xhr.status === 404 ? "gone" : "fail"); report(); };
      xhr.onerror = xhr.ontimeout = () => { sent.delete(i); resolve("fail"); };
      xhr.send(blob);
    });
    const queue = Array.from({ length: chunks }, (_, i) => i).filter((i) => !have.has(i));
    let failed = false, gone = false;
    const worker = async () => {
      while (queue.length && !failed && !gone) {
        const i = queue.shift()!;
        let ok = false;
        for (let attempt = 0; attempt < 10 && !ok && !gone; attempt++) {
          const r = await putChunk(i);
          if (r === "ok") ok = true; else if (r === "gone") gone = true; else await sleep(Math.min(15000, 1000 * 2 ** attempt));
        }
        if (ok) have.add(i); else failed = true;
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    if (gone) { toast.err("The server forgot this upload; starting it again"); try { localStorage.removeItem(key); } catch {} setProgress(null); return upload(file); }
    if (failed) { toast.err(`Upload paused at ${Math.round((have.size / chunks) * 100)}%: check the connection and pick the same file again to resume.`); setProgress(null); return; }
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
  const encode = async (id: string) => { try { await api(`/api/admin/theater/${id}/encode`, { method: "POST" }); toast.ok("Queued for downsampling"); list.reload(); } catch (e) { toast.err((e as Error).message); } };
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
              <div className="admMuted" style={{ fontSize: 12 }}>Uploading {progress.name} · {progress.pct}%{progress.rate ? ` · ${(progress.rate / 1024 ** 2).toFixed(1)} MB/s` : ""}{progress.eta != null && progress.rate ? ` · about ${progress.eta >= 90 ? `${Math.round(progress.eta / 60)} min` : `${progress.eta} s`} left` : ""}</div>
              <div style={{ height: 6, background: "var(--surface-2)", border: "1px solid var(--rule)" }}><div style={{ height: "100%", width: `${progress.pct}%`, background: "var(--heat-1)" }} /></div>
            </div>
          )}
          <p className="admMuted" style={{ fontSize: 12 }}>Uploads go up in 8 MB pieces and resume: if the connection drops or the tab closes, pick the same file again and it continues from where it stopped.</p>
          {list.data && (list.data.encoder
            ? <p className="admNote admNote--ok" style={{ fontSize: 12 }}>After upload each film is downsampled on the server for the screen: H.264 at most {list.data.target.height}p and about {(list.data.target.kbps / 1000).toFixed(1)} Mbps, with the index up front so it starts and seeks instantly. It plays once that is done (a feature film takes several minutes); films that are already small are only repackaged.</p>
            : <p className="admNote admNote--err" style={{ fontSize: 12 }}>ffmpeg is not installed on the server, so films play as uploaded. Install it (<span className="admMono">sudo apt install ffmpeg</span>, then restart the app) and uploads will be downsampled to {list.data.target.height}p automatically, which is what stops the screen from stalling.</p>)}
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
                <td className="num">{fmtBytes(r.bytes)}{r.status === "processing" && <div><Badge kind="warn">{list.data?.encoding === r.id ? "downsampling…" : "queued"}</Badge></div>}</td>
                <td><input type="checkbox" checked={!!r.enabled} onChange={(e) => void patch(r.id, { enabled: e.target.checked })} /></td>
                <td className="act">
                  <button className="admBtn admBtn--sm" disabled={i === 0} onClick={() => void move(i, -1)} title="Earlier">↑</button>{" "}
                  <button className="admBtn admBtn--sm" disabled={i === rows.length - 1} onClick={() => void move(i, 1)} title="Later">↓</button>{" "}
                  {r.kind === "file" && r.status === "ready" && list.data?.encoder && <><button className="admBtn admBtn--sm" onClick={() => void encode(r.id)} title="Re-encode for the screen">Downsample</button>{" "}</>}
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
