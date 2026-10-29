import { headers } from "next/headers";
import { Simulator } from "@/components/pages/Simulator";

export const metadata = { title: "Test checkout", robots: { index: false } };

/* Stands in for DivinityCoin's hosted page in test mode. Speaks the same
   postMessage protocol as the real embed (ready / resize / complete). */
export default async function SimulatePage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  return <Simulator reference={sp.reference ?? ""} amount={sp.amount ?? "0"} kind={sp.kind === "setup" ? "setup" : "payment"} success={safeReturn(sp.success, (await headers()).get("host"))} />;
}

/** Only a path on this site: a crafted link must not send the buyer elsewhere or run a javascript: URL. */
function safeReturn(v: string | undefined, host: string | null): string {
  if (!v) return "/";
  try {
    const u = new URL(v, "http://x.invalid");
    if (u.origin !== "http://x.invalid") {
      return (u.protocol === "https:" || u.protocol === "http:") && host && u.host === host ? `${u.pathname}${u.search}${u.hash}` : "/";
    }
    return `${u.pathname}${u.search}${u.hash}`;
  } catch { return "/"; }
}
