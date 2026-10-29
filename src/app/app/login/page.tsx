import { redirect } from "next/navigation";
import { Shell } from "@/components/pages/Shell";
import { currentUser } from "@/lib/auth";
import { SignIn } from "@/components/ui/AuthForms";
import { safeLocalPath } from "@/lib/util";

export const metadata = { title: "Sign in" };
/** Only a path on this site: never another host, a protocol-relative URL or javascript:. Old links used /dashboard and /arcade. */
function safeNext(n: string | undefined): string {
  n = safeLocalPath(n, "");
  if (!n) return "/app/dashboard";
  return /^\/(dashboard|arcade)(\/|$|\?)/.test(n) ? `/app${n}` : n;
}

export default async function Login({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const next = safeNext(sp.next);
  if (await currentUser()) redirect(next);
  return (
    <Shell>
      <div className="mx-auto max-w-sm">
        <h1 className="text-2xl font-bold">Sign in</h1>
        <p className="mt-1 text-sm text-slate-400">Email and password. New here? Create an account in a few seconds.</p>
        <div className="mt-4"><SignIn next={next} start={sp.mode === "signup" ? "signup" : "signin"} /></div>
      </div>
    </Shell>
  );
}
