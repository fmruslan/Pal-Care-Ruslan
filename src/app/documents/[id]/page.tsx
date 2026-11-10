import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { getDemoData } from "@/lib/demo/repository";
import { findTwin, recordIdSchema, displayDate } from "@/lib/demo/presentation";
import {
  libraryReturn,
  withLibraryReturn,
  type LibraryParams,
} from "@/lib/library-navigation";
import { contextOf } from "@/lib/careos/contracts";
import {
  CareContextRegistration,
  AskCareOS,
} from "@/components/careos/provider";
import { Shell } from "@/components/shell";
import { PageHeading } from "@/components/page-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ProductArt } from "@/components/product-art";
import { documentPresentation } from "@/lib/document-presentation";
import { DocumentContent } from "@/components/document-content";

export const metadata = { title: "Purchase document" };
export default async function DocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<LibraryParams>;
}) {
  const from = libraryReturn((await searchParams)?.from);
  const { id } = await params;
  if (!recordIdSchema.safeParse(id).success) notFound();
  const data = await getDemoData(undefined, id);
  const document = data.documents.find((d) => d.id === id);
  const record = document && findTwin(data, document.twinId);
  if (!document || !record) notFound();
  const view = documentPresentation(document, record);
  return (
    <Shell active="/documents" source={data.source}>
      <CareContextRegistration context={contextOf(record)} />
      <Link
        href={withLibraryReturn(`/vault/${record.twin.id}`, from)}
        className="mb-3 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to {record.product.name}
      </Link>
      <PageHeading
        title={view.title}
        action={
          <Badge tone={document.origin === "sandbox" ? "success" : "neutral"}>
            {view.provenance}
          </Badge>
        }
      />
      <div className="customer-record-context mb-5 flex flex-wrap items-center gap-4 rounded-2xl border bg-card p-4">
        <ProductArt kind={record.product.illustration} size="thumbnail" />
        <div className="min-w-0 flex-1 basis-44">
          <Link
            href={withLibraryReturn(`/vault/${record.twin.id}`, from)}
            className="inline-flex min-h-11 items-center font-semibold underline-offset-4 hover:text-primary hover:underline"
          >
            {record.product.name}
          </Link>
          <p className="text-sm leading-6 text-muted-foreground">
            {record.product.brand} {record.product.model} ·{" "}
            <time dateTime={record.twin.purchasedOn}>
              {displayDate(record.twin.purchasedOn)}
            </time>
          </p>
        </div>
      </div>
      <div className="mb-5 flex flex-wrap gap-3">
        <Button asChild variant="outline">
          <a href={`/api/documents/${id}/download`}>
            <Download aria-hidden="true" />
            Download text
          </a>
        </Button>
        <AskCareOS
          context={contextOf(record)}
          label="Ask North about this document"
        />
      </div>
      <article
        aria-label="Document contents"
        className="customer-document-reader max-w-4xl rounded-2xl border bg-card"
      >
        <div className="p-5 sm:p-8">
          <DocumentContent view={view} />
        </div>
      </article>
      <details className="mt-5 max-w-4xl rounded-2xl border bg-card p-5">
        <summary className="min-h-11 cursor-pointer font-semibold">
          View original record
        </summary>
        <p className="mb-3 text-sm text-muted-foreground">
          Original title: {document.title}
        </p>
        <pre className="font-mono text-xs leading-6 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
          {document.content}
        </pre>
      </details>
    </Shell>
  );
}
