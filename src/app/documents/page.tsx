import { FileText, ShieldCheck } from "lucide-react";
import { getDemoData } from "@/lib/demo/repository";
import { Shell } from "@/components/shell";
import { DocumentList } from "@/components/vault";
import { PageHeading } from "@/components/page-heading";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Documents" };
export default async function Documents() {
  const data = await getDemoData();
  return (
    <Shell active="/documents" source={data.source}>
      <PageHeading
        eyebrow="The details, close at hand"
        title="Your paperwork, together."
        description="Receipts and product documents, connected to their Purchase Twins. Every file keeps its source label."
        action={
          <Badge tone="blue">
            <FileText className="size-3.5" aria-hidden="true" />
            {data.documents.length} documents
          </Badge>
        }
      />
      <DocumentList documents={data.documents} />
      <div className="mt-6 flex items-start gap-3 rounded-2xl bg-secondary p-5 text-sm leading-7 text-secondary-foreground">
        <ShieldCheck className="mt-1 size-4 shrink-0" aria-hidden="true" />
        <p>
          Sample documents are fictional. Sandbox receipts appear only after a
          verified capture. Official guidance for the Raspberry Pi 5 reference
          sample is available in Product care with its own attribution. No
          real-money receipts, uploads, or warranty coverage are implied.
        </p>
      </div>
    </Shell>
  );
}
