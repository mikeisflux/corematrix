import { notFound } from "next/navigation";
import { ModelExporter } from "@/components/dev/ModelExporter";

/** Dev-only: builds the procedural models and exposes window.__exportModels() for scripts/export-models.mjs. */
export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ModelExporter />;
}
