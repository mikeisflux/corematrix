import Link from "next/link";
import { SITE_NAME } from "@/lib/config";

export function Nav() {
  return (
    <header className="sticky top-0 z-40">
      <div className="mx-auto mt-3 flex max-w-6xl items-center gap-3 rounded-full border border-white/10 bg-[#0a0a16]/70 px-3 py-2 backdrop-blur-xl md:mt-4 md:px-4">
        <Link href="/" className="display flex items-center gap-2 text-[14px] font-extrabold tracking-tight md:text-[15px]">
          <span className="relative inline-block h-6 w-6 rounded-lg bg-gradient-to-br from-[#ffe08a] to-[#ff9a3c] shadow-[0_0_24px_rgba(255,207,92,0.7)]"><span className="absolute inset-[6px] rounded-sm bg-[#07070f]/80" /></span>
          {SITE_NAME}
        </Link>
        <nav className="ml-4 hidden items-center gap-1 text-sm text-slate-300 md:flex">
          {[["#floor", "The floor"], ["#walk", "Walk it"], ["#pricing", "Booths"], ["#economy", "Economy"], ["#faq", "FAQ"]].map(([h, l]) => <a key={h} href={h} className="rounded-full px-3 py-1.5 hover:bg-white/5 hover:text-white">{l}</a>)}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/app/directory" className="hidden rounded-full px-3 py-1.5 text-sm text-slate-300 hover:text-white sm:block">Exhibitors</Link>
          <Link href="/app" className="mk-btn mk-btn--primary !px-4 !py-2 !text-sm whitespace-nowrap"><span className="hidden sm:inline">Enter the hall</span><span className="sm:hidden">Enter</span> →</Link>
        </div>
      </div>
    </header>
  );
}
