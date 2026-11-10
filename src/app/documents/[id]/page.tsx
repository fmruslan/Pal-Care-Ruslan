import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { getDemoData } from "@/lib/demo/repository";
import {
  findTwin,
  recordIdSchema,
  displayDate,
  money,
} from "@/lib/demo/presentation";
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
import { PurchaseBadge } from "@/components/vault";
import { REFERENCE_PRODUCT } from "@/lib/careos/knowledge";

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
        title={document.title}
        description="Read the saved document or download a text copy. Sample documents are fictional; Sandbox receipts involve no real money."
        action={
          <Badge tone={document.origin === "sandbox" ? "success" : "neutral"}>
            {document.origin === "sandbox"
              ? "Verified Sandbox receipt"
              : "Fictional sample document"}
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
          <p className="text-sm leading-6 text-muted-foreground">
            {record.product.id === REFERENCE_PRODUCT
              ? "Reference sample · amount unavailable"
              : `${record.twin.origin === "sandbox" ? "Sandbox" : "Sample"} amount ${money(record.twin.purchasePriceMinor)}`}
          </p>
        </div>
        <PurchaseBadge origin={record.twin.origin} />
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
        <pre className="overflow-wrap-anywhere p-5 font-sans text-base leading-8 whitespace-pre-wrap break-words sm:p-8">
          {document.content}
        </pre>
      </article>
    </Shell>
  );
}
