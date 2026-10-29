import { headers } from "next/headers";
import { safeLocalPath } from "@/lib/util";
import { Simulator } from "@/components/pages/Simulator";

export const metadata = { title: "Test checkout", robots: { index: false } };

/* Stands in for DivinityCoin's hosted page in test mode. Speaks the same
   postMessage protocol as the real embed (ready / resize / complete). */
export default async function SimulatePage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  return <Simulator reference={sp.reference ?? ""} amount={sp.amount ?? "0"} kind={sp.kind === "setup" ? "setup" : "payment"} success={safeReturn(sp.success, (await headers()).get("host"))} />;
}

/** Only a path on this site (an absolute URL on this host is cut down to its path): never another host, a javascript: URL, or "/.//evil.com". */
function safeReturn(v: string | undefined, host: string | null): string {
  if (v && host) {
    try { const u = new URL(v); if ((u.protocol === "https:" || u.protocol === "http:") && u.host === host) v = `${u.pathname}${u.search}${u.hash}`; } catch { /* relative: checked below */ }
  }
  return safeLocalPath(v, "/");
}
