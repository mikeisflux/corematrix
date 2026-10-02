import Link from "next/link";
import { SITE_NAME } from "@/lib/config";
import { currentUser } from "@/lib/auth";

export async function Shell({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  const user = await currentUser();
  return (
    <div className="min-h-dvh bg-[var(--bg)] text-[var(--fg)]">
      <header className="sticky top-0 z-20 border-b border-white/8 bg-[var(--bg)]/80 backdrop-blur">
        <div className={`mx-auto flex h-14 items-center gap-4 px-4 ${wide ? "max-w-7xl" : "max-w-5xl"}`}>
          <Link href="/" className="flex items-center gap-2 font-bold tracking-tight"><span className="inline-block h-5 w-5 rounded-md bg-amber-300" />{SITE_NAME}</Link>
          <nav className="ml-4 hidden items-center gap-1 text-sm text-slate-300 md:flex">
            <Link className="rounded-lg px-3 py-1.5 hover:bg-white/5 hover:text-white" href="/">City</Link>
            <Link className="rounded-lg px-3 py-1.5 hover:bg-white/5 hover:text-white" href="/rankings">Rankings</Link>
            <Link className="rounded-lg px-3 py-1.5 hover:bg-white/5 hover:text-white" href="/directory">Directory</Link>
            <Link className="rounded-lg px-3 py-1.5 hover:bg-white/5 hover:text-white" href="/arcade">Arcade</Link>
            <Link className="rounded-lg px-3 py-1.5 hover:bg-white/5 hover:text-white" href="/how-it-works">How it works</Link>
          </nav>
          <div className="ml-auto flex items-center gap-2 text-sm">
            {user ? (
              <>
                <Link href="/dashboard" className="btn-ghost text-xs">Dashboard</Link>
                {user.isAdmin && <Link href="/admin" className="btn-ghost text-xs">Admin</Link>}
              </>
            ) : (
              <Link href="/login" className="btn-ghost text-xs">Sign in</Link>
            )}
            <Link href="/?claim=1" className="btn-primary text-xs">Claim a plot</Link>
          </div>
        </div>
      </header>
      <main className={`mx-auto px-4 py-8 ${wide ? "max-w-7xl" : "max-w-5xl"}`}>{children}</main>
      <footer className="mx-auto max-w-5xl px-4 py-10 text-xs text-slate-500">
        {SITE_NAME} · a living city for brands and creators · <Link className="hover:text-white" href="/how-it-works">rules & refunds</Link>
      </footer>
    </div>
  );
}
