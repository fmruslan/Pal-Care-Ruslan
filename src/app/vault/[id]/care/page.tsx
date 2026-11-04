import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen, ArrowUpRight } from "lucide-react";
import { getDemoData } from "@/lib/demo/repository";
import {
  findTwin,
  recordIdSchema,
  displayDate,
  money,
} from "@/lib/demo/presentation";
import { getKnowledge } from "@/lib/careos/knowledge-repository";
import { contextOf } from "@/lib/careos/contracts";
import {
  AskCareOS,
  CareContextRegistration,
} from "@/components/careos/provider";
import { Shell } from "@/components/shell";
import { PageHeading } from "@/components/page-heading";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProductArt } from "@/components/product-art";
import { PurchaseBadge } from "@/components/vault";
import { REFERENCE_PRODUCT } from "@/lib/careos/knowledge";
import {
  libraryReturn,
  withLibraryReturn,
  type LibraryParams,
} from "@/lib/library-navigation";

export const metadata = { title: "Product care" };
export default async function CarePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<LibraryParams>;
}) {
  const from = libraryReturn((await searchParams)?.from);
  const { id } = await params;
  if (!recordIdSchema.safeParse(id).success) notFound();
  const data = await getDemoData(id);
  const record = findTwin(data, id);
  if (!record) notFound();
  const sources = (await getKnowledge()).filter(
    (s) =>
      s.productId === record.product.id &&
      s.brand === record.product.brand &&
      s.model === record.product.model &&
      s.status !== "withdrawn",
  );
  return (
    <Shell active="/vault" source={data.source}>
      <CareContextRegistration context={contextOf(record)} />
      <Link
        href={withLibraryReturn(`/vault/${id}`, from)}
        className="mb-3 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to {record.product.name}
      </Link>
      <PageHeading
        title="Product care"
        description="Documentation matched to this exact product. Missing guides stay missing — another model’s instructions won’t be substituted."
        action={
          <AskCareOS
            context={contextOf(record)}
            label="Ask North about product care"
          />
        }
      />
      <div className="customer-record-context mb-6 flex flex-wrap items-center gap-4 rounded-2xl border bg-card p-4">
        <ProductArt kind={record.product.illustration} size="thumbnail" />
        <div className="min-w-0 flex-1 basis-44">
          <Link
            href={withLibraryReturn(`/vault/${id}`, from)}
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
      {!sources.length && (
        <Card className="customer-care-empty">
          <BookOpen
            className="mb-4 size-6 text-intelligence-foreground"
            aria-hidden="true"
          />
          <h2 className="section-title">
            No manufacturer care guide available
          </h2>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">
            No manufacturer care guide is available for {record.product.brand}{" "}
            {record.product.model} in your records. Instructions for other
            models won’t be substituted.
          </p>
        </Card>
      )}
      <div className="customer-care-sources space-y-6">
        {sources.map((source) => (
          <Card key={source.id} id={`source-${source.id}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">{source.title}</h2>
              <Badge tone="blue">
                {source.status === "approved"
                  ? "Official documentation"
                  : "Conflicting source"}
              </Badge>
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              {source.section} · English · reviewed {source.reviewedOn}
            </p>
            <blockquote className="my-6 max-w-[75ch] border-l-2 border-lavender pl-5 text-base leading-8 whitespace-pre-line">
              {source.content}
            </blockquote>
            <a
              href={source.url}
              rel="noreferrer"
              target="_blank"
              className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary"
            >
              Open original guide
              <ArrowUpRight className="size-4" aria-hidden="true" />
              <span className="sr-only"> (new tab)</span>
            </a>
            <p className="mt-4 text-xs leading-6 text-muted-foreground">
              © {source.publisher}.{" "}
              <a
                className="underline"
                href="https://creativecommons.org/licenses/by-sa/4.0/"
              >
                CC BY-SA 4.0
              </a>
              . Excerpt selection adapted for Raspberry Pi 5 running Raspberry
              Pi OS; other model shortcuts omitted. North Star summaries of this
              material are adaptations under the same licence. No endorsement is
              implied.
            </p>
            <details className="mt-4 text-xs text-muted-foreground">
              <summary className="min-h-11 cursor-pointer py-3">
                Source version and integrity
              </summary>
              <p>{source.revision}</p>
              <p className="mt-2 break-all">SHA-256: {source.contentHash}</p>
            </details>
          </Card>
        ))}
      </div>
      <p className="mt-6 text-sm text-muted-foreground">
        Purchase provenance is separate from documentation. No warranty
        coverage, recall status or live monitoring is established by this guide.
      </p>
    </Shell>
  );
}
