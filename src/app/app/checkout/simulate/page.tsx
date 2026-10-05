import { Simulator } from "@/components/pages/Simulator";

export const metadata = { title: "Test checkout", robots: { index: false } };

/* Stands in for DivinityCoin's hosted page in test mode. Speaks the same
   postMessage protocol as the real embed (ready / resize / complete). */
export default async function SimulatePage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  return <Simulator reference={sp.reference ?? ""} amount={sp.amount ?? "0"} kind={sp.kind === "setup" ? "setup" : "payment"} success={sp.success ?? "/"} />;
}
