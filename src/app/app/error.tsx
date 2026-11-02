"use client";
import { useEffect } from "react";
import Link from "next/link";

/**
 * The route's error page: what a visitor sees if rendering the hall throws before the hall's own boundary can catch it
 * (a server-side error, for instance). Next's default is a bare "This page couldn't load"; this one says what to do and
 * shows the digest that matches the line in the server log.
 */
export default function HallError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("[hall] route error", error); }, [error]);
  return (
    <main className="grid min-h-dvh place-items-center bg-[var(--bg)] px-4 text-center text-slate-200">
      <div className="max-w-md">
        <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-amber-300">The show floor</div>
        <h1 className="mt-2 text-2xl font-bold">The hall didn&apos;t open</h1>
        <p className="mt-2 text-sm text-slate-400">Something went wrong putting the floor together. Try again; if it keeps happening, tell us and quote the code below.</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <button onClick={() => reset()} className="btn-primary">Try again</button>
          <button onClick={() => location.reload()} className="btn-ghost">Reload the page</button>
          <Link href="/" className="btn-ghost">Home</Link>
        </div>
        {error.digest && <p className="mono mt-4 text-[11px] text-slate-500">code {error.digest}</p>}
      </div>
    </main>
  );
}
