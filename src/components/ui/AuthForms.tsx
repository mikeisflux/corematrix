"use client";
import { useState } from "react";
import { api } from "@/lib/hall/store";

type Mode = "signin" | "signup" | "forgot";
/** Email + password sign-in / sign-up / forgot. Used inline in hall panels and on /app/login. */
export function SignIn({ next, note, start = "signin" }: { next?: string; note?: string; start?: Mode }) {
  const [mode, setMode] = useState<Mode>(start);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const want = next ?? (typeof window !== "undefined" ? window.location.pathname + window.location.search : "/app");
  const dest = /^\/(?![/\\])/.test(want) ? want : "/app";
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null); setMsg(null);
    try {
      if (mode === "forgot") { await api("/api/auth/forgot", { method: "POST", body: JSON.stringify({ email }) }); setMsg("If that email has an account, a reset link is on its way."); setBusy(false); return; }
      const ref = typeof window !== "undefined" ? localStorage.getItem("fcc_ref") ?? undefined : undefined;
      if (mode === "signup") await api("/api/auth/register", { method: "POST", body: JSON.stringify({ email, password, displayName: name, ref }) });
      else await api("/api/auth/password", { method: "POST", body: JSON.stringify({ email, password }) });
      window.location.href = dest;
    } catch (er) { setErr((er as Error).message); setBusy(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-2">
      {note && <p className="text-xs text-slate-300">{note}</p>}
      <div className="flex gap-1 text-xs">
        <button type="button" onClick={() => setMode("signin")} className={`rounded-lg px-3 py-1 ${mode === "signin" ? "bg-amber-300 font-semibold text-slate-950" : "bg-white/5"}`}>Sign in</button>
        <button type="button" onClick={() => setMode("signup")} className={`rounded-lg px-3 py-1 ${mode === "signup" ? "bg-amber-300 font-semibold text-slate-950" : "bg-white/5"}`}>Create account</button>
      </div>
      {mode === "signup" && <input className="input" maxLength={40} placeholder="Your name or studio" value={name} onChange={(e) => setName(e.target.value)} />}
      <input className="input" type="email" required autoComplete="username" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
      {mode !== "forgot" && <input className="input" type="password" required minLength={10} autoComplete={mode === "signup" ? "new-password" : "current-password"} placeholder={mode === "signup" ? "password, 10+ characters" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} />}
      <button className="btn-primary w-full" disabled={busy}>{busy ? "…" : mode === "signup" ? "Create account" : mode === "forgot" ? "Email me a reset link" : "Sign in"}</button>
      {err && <p className="text-xs text-rose-400">{err}</p>}
      {msg && <p className="text-xs text-emerald-400">{msg}</p>}
      <p className="text-[11px] text-slate-500">
        {mode === "forgot" ? <button type="button" className="underline" onClick={() => setMode("signin")}>Back to sign in</button> : <button type="button" className="underline" onClick={() => setMode("forgot")}>Forgot your password?</button>}
        {mode === "signup" && " · New accounts start with free arcade coins."}
      </p>
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form className="space-y-2" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(null); try { await api("/api/auth/reset", { method: "POST", body: JSON.stringify({ token, password }) }); window.location.href = "/app/dashboard"; } catch (er) { setErr((er as Error).message); setBusy(false); } }}>
      <input className="input" type="password" required minLength={10} autoComplete="new-password" placeholder="new password" value={password} onChange={(e) => setPassword(e.target.value)} />
      <button className="btn-primary w-full" disabled={busy || !token}>{busy ? "…" : "Set password and sign in"}</button>
      {!token && <p className="text-xs text-rose-400">This link is missing its token. Request a new reset email.</p>}
      {err && <p className="text-xs text-rose-400">{err}</p>}
    </form>
  );
}

/** Account page: change password. */
export function ChangePassword() {
  const [current, setCurrent] = useState(""); const [next, setNext] = useState(""); const [msg, setMsg] = useState<string | null>(null); const [err, setErr] = useState<string | null>(null);
  return (
    <form className="space-y-2" onSubmit={async (e) => { e.preventDefault(); setErr(null); setMsg(null); try { await api("/api/auth/change-password", { method: "POST", body: JSON.stringify({ current, next }) }); setMsg("Password changed."); setCurrent(""); setNext(""); } catch (er) { setErr((er as Error).message); } }}>
      <input className="input" type="password" required autoComplete="current-password" placeholder="current password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      <input className="input" type="password" required minLength={10} autoComplete="new-password" placeholder="new password, 10+ characters" value={next} onChange={(e) => setNext(e.target.value)} />
      <button className="btn-ghost w-full text-xs">Change password</button>
      {msg && <p className="text-xs text-emerald-400">{msg}</p>}{err && <p className="text-xs text-rose-400">{err}</p>}
    </form>
  );
}

/** The page a confirm link opens: one button, so a mail scanner opening the link doesn't use it up. */
export function VerifyEmail({ token }: { token: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [err, setErr] = useState<string | null>(null);
  if (state === "done") return (
    <div className="space-y-3">
      <p className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 p-3 text-sm text-emerald-200">Email confirmed. Any team seats waiting for this address are yours now.</p>
      <a className="btn-primary block w-full text-center" href="/app">Back to the show floor</a>
    </div>
  );
  return (
    <div className="space-y-2">
      <button className="btn-primary w-full" disabled={state === "busy" || !token} onClick={async () => { setState("busy"); setErr(null); try { await api("/api/auth/verify", { method: "POST", body: JSON.stringify({ token }) }); setState("done"); } catch (e) { setErr((e as Error).message); setState("idle"); } }}>{state === "busy" ? "…" : "Confirm my email"}</button>
      {!token && <p className="text-xs text-rose-400">This link is missing its token. Send yourself a new one from your dashboard.</p>}
      {err && <p className="text-xs text-rose-400">{err}</p>}
    </div>
  );
}

/** A nudge for accounts that haven't confirmed their address yet, with a resend button. */
export function VerifyNudge({ email, compact = false }: { email: string; compact?: boolean }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const resend = async () => { setBusy(true); setMsg(null); try { await api("/api/auth/verify/resend", { method: "POST" }); setMsg(`Sent to ${email}. Check spam if it isn't there in a minute.`); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); } };
  return (
    <div className={`rounded-xl border border-amber-300/30 bg-amber-300/10 ${compact ? "p-2 text-xs" : "p-3 text-sm"} text-amber-100`}>
      <div><b>Confirm your email.</b> Team seats people invite you to by email wait until you do. We sent a link to <span className="break-all">{email}</span>.</div>
      <button className="btn-ghost mt-2 text-xs" onClick={resend} disabled={busy}>{busy ? "Sending…" : "Send it again"}</button>
      {msg && <div className="mt-1 text-[11px] text-amber-200/80">{msg}</div>}
    </div>
  );
}
