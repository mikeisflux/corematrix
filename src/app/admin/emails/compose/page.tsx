import { redirect } from "next/navigation";
/* Compose lives inside the inbox as an in-page panel; this route forwards its prefill params. */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const p = new URLSearchParams({ compose: "1" });
  for (const k of ["to", "cc", "bcc", "subject", "threadId", "quote", "draft"]) if (sp[k]) p.set(k, sp[k] as string);
  redirect(`/admin/emails?${p.toString()}`);
}
