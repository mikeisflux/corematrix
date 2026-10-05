import Inbox from "@/components/admin/Inbox";
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const compose = sp.compose === "1" || !!(sp.to || sp.subject || sp.draft);
  return <Inbox initialId={sp.id || null} initialFolder={sp.folder || "inbox"} initialCompose={compose ? { draftId: sp.draft || null, to: sp.to || "", cc: sp.cc || "", bcc: sp.bcc || "", subject: sp.subject || "", threadId: sp.threadId || "", quote: sp.quote || "" } : null} />;
}
