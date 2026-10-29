import { Shell } from "@/components/pages/Shell";
import { VerifyEmail } from "@/components/ui/AuthForms";

export const metadata = { title: "Confirm your email", robots: { index: false } };
export default async function Verify({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  return (
    <Shell>
      <div className="mx-auto max-w-sm">
        <h1 className="text-2xl font-bold">Confirm your email</h1>
        <p className="mt-1 text-sm text-slate-400">One click. It unlocks team seats people invite you to by email.</p>
        <div className="mt-4"><VerifyEmail token={sp.token ?? ""} /></div>
      </div>
    </Shell>
  );
}
