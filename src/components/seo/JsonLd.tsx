import { ldString } from "@/lib/seo";

/** schema.org structured data for the page; see lib/seo.ts for the builders. */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ldString(data) }} />;
}
