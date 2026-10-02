import { redirect } from "next/navigation";
import { Shell } from "@/components/pages/Shell";
import { currentUser } from "@/lib/auth";
import { SignIn } from "@/components/city/panels/common";

export const metadata = { title: "Sign in" };

export default async function Login({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  if (await currentUser()) redirect(sp.next ?? "/dashboard");
  return (
    <Shell>
      <div className="mx-auto max-w-sm">
        <h1 className="text-2xl font-bold">Sign in</h1>
        <p className="mt-1 text-sm text-slate-400">We'll email you a link. No password to remember.</p>
        {sp.error === "expired" && <p className="mt-3 rounded-xl border border-rose-400/30 bg-rose-400/10 p-3 text-sm">That link expired or was already used. Request a new one.</p>}
        <div className="mt-4"><SignIn next={sp.next ?? "/dashboard"} /></div>
      </div>
    </Shell>
  );
}
