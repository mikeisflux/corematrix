import { Shell } from "@/components/pages/Shell";
import { ResetForm } from "@/components/ui/AuthForms";

export const metadata = { title: "Choose a new password" };
export default async function Reset({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  return (
    <Shell>
      <div className="mx-auto max-w-sm">
        <h1 className="text-2xl font-bold">Choose a new password</h1>
        <p className="mt-1 text-sm text-slate-400">At least 10 characters. You'll be signed in right after.</p>
        <div className="mt-4"><ResetForm token={sp.token ?? ""} /></div>
      </div>
    </Shell>
  );
}
