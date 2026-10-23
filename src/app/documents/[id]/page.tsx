import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { getDemoData } from "@/lib/demo/repository";
import { findTwin, recordIdSchema } from "@/lib/demo/presentation";
import { contextOf } from "@/lib/careos/contracts";
import {
  CareContextRegistration,
  AskCareOS,
} from "@/components/careos/provider";
import { Shell } from "@/components/shell";
import { PageHeading } from "@/components/page-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Purchase document" };
export default async function DocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!recordIdSchema.safeParse(id).success) notFound();
  const data = await getDemoData(undefined, id);
  const document = data.documents.find((d) => d.id === id);
  const record = document && findTwin(data, document.twinId);
  if (!document || !record) notFound();
  return (
    <Shell active="/documents" source={data.source}>
      <CareContextRegistration context={contextOf(record)} />
      <Link
        href={`/vault/${record.twin.id}`}
        className="mb-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to {record.product.name}
      </Link>
      <PageHeading
        eyebrow="Your paperwork, close at hand"
        title={document.title}
        description={`${record.product.brand} ${record.product.model} · Saved purchase document`}
        action={
          <Badge tone={document.origin === "sandbox" ? "success" : "neutral"}>
            {document.origin === "sandbox"
              ? "Verified Sandbox receipt"
              : "Fictional sample document"}
          </Badge>
        }
      />
      <article aria-label="Document contents" className="passport-frame">
        <pre className="overflow-wrap-anywhere rounded-[27px] bg-card p-5 font-sans text-sm leading-8 whitespace-pre-wrap break-words sm:p-8">
          {document.content}
        </pre>
      </article>
      <div className="mt-6 flex flex-wrap gap-3">
        <Button asChild variant="outline">
          <a href={`/api/documents/${id}/download`}>
            <Download aria-hidden="true" />
            Download text
          </a>
        </Button>
        <AskCareOS context={contextOf(record)} />
      </div>
    </Shell>
  );
}
