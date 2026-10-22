import { getDemoData } from "@/lib/demo/repository";
import { Shell } from "@/components/shell";
import { DocumentList } from "@/components/vault";

export const metadata = { title: "Documents" };

export default async function Documents() {
  const data = await getDemoData();
  return (
    <Shell active="/documents" source={data.source}>
      <p className="text-xs font-semibold uppercase tracking-[.18em] text-muted-foreground">
        THE DETAILS, CLOSE AT HAND
      </p>
      <h1 className="mt-3 font-display text-4xl sm:text-5xl">
        Your paperwork, together.
      </h1>
      <p className="mt-4 mb-8 max-w-2xl text-sm leading-7 text-muted-foreground">
        Original sample documents and receipts from verified sandbox captures,
        when available. Every document is source-labeled and publicly
        downloadable for judging. No real-money receipts, manufacturer manuals,
        personal uploads or warranty coverage are implied.
      </p>
      <DocumentList documents={data.documents} />
    </Shell>
  );
}
