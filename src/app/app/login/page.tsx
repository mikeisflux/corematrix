import { redirect } from "next/navigation";
import { Shell } from "@/components/pages/Shell";
import { currentUser } from "@/lib/auth";
import { SignIn } from "@/components/ui/AuthForms";

export const metadata = { title: "Sign in" };

export default async function Login({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  if (await currentUser()) redirect(sp.next ?? "/app/dashboard");
  return (
    <Shell>
      <div className="mx-auto max-w-sm">
        <h1 className="text-2xl font-bold">Sign in</h1>
        <p className="mt-1 text-sm text-slate-400">Email and password. New here? Create an account in a few seconds.</p>
        <div className="mt-4"><SignIn next={sp.next ?? "/app/dashboard"} start={sp.mode === "signup" ? "signup" : "signin"} /></div>
      </div>
    </Shell>
  );
}
