import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen, ArrowUpRight } from "lucide-react";
import { getDemoData } from "@/lib/demo/repository";
import { findTwin, recordIdSchema } from "@/lib/demo/presentation";
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

export const metadata = { title: "Product care" };
export default async function CarePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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
        href={`/vault/${id}`}
        className="mb-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to {record.product.name}
      </Link>
      <PageHeading
        eyebrow="CareOS · Guidance with a source"
        title="A little knowledge. Better care."
        description={`${record.product.name} · ${record.product.brand} ${record.product.model}. Only documentation matched to this product is shown.`}
        action={
          <AskCareOS context={contextOf(record)}>
            Ask about product care
          </AskCareOS>
        }
      />
      {!sources.length && (
        <Card>
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
      <div className="space-y-6">
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
            <blockquote className="my-6 border-l-2 border-lavender pl-5 text-base leading-8 whitespace-pre-line">
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
              Pi OS; other model shortcuts omitted. CareOS summaries of this
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
