"use client";
/**
 * The hall must never go white. A render error is reported to the server
 * log and replaced with a card that reloads the floor; uncaught errors and
 * rejected promises anywhere on the page are reported too.
 */
import { Component, useEffect, type ReactNode } from "react";

export function reportClientError(where: string, err: unknown) {
  try {
    const e = err instanceof Error ? err : new Error(String(err));
    const body = JSON.stringify({ message: e.message.slice(0, 500), stack: (e.stack ?? "").slice(0, 4000), url: location.pathname + location.search, where, ua: navigator.userAgent.slice(0, 300) });
    if (navigator.sendBeacon) navigator.sendBeacon("/api/client-error", new Blob([body], { type: "application/json" }));
    else void fetch("/api/client-error", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true });
  } catch { /* reporting must never throw */ }
}

/** Reports window-level errors once mounted. */
export function ErrorReporter() {
  useEffect(() => {
    const onErr = (ev: ErrorEvent) => reportClientError("window.onerror", ev.error ?? ev.message);
    const onRej = (ev: PromiseRejectionEvent) => reportClientError("unhandledrejection", ev.reason);
    window.addEventListener("error", onErr); window.addEventListener("unhandledrejection", onRej);
    return () => { window.removeEventListener("error", onErr); window.removeEventListener("unhandledrejection", onRej); };
  }, []);
  return null;
}

export class HallErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: { componentStack?: string | null }) { reportClientError("render", Object.assign(new Error(error.message), { stack: `${error.stack ?? ""}\n--- component stack ---${info.componentStack ?? ""}` })); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="absolute inset-0 z-[60] grid place-items-center bg-slate-950 text-center text-sm text-slate-200">
        <div className="max-w-sm px-4">
          <div className="text-lg font-bold">The floor hit a snag</div>
          <div className="mt-1 text-slate-400">Something in the hall threw an error. It has been reported. Reloading puts you right back where you were.</div>
          <div className="mt-2 rounded-lg bg-white/5 px-2 py-1 text-left text-[11px] text-slate-500 mono break-words">{this.state.error.message.slice(0, 160)}</div>
          <button onClick={() => location.reload()} className="btn-primary mt-3">Reload the floor</button>
        </div>
      </div>
    );
  }
}
