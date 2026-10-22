import Link from "next/link";
import { ArrowRight, Archive, FileText } from "lucide-react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import type { CareDocument, DemoData } from "@/db/schema";
import { findTwin, money, displayDate } from "@/lib/demo/presentation";
import { ProductArt } from "./product-art";

export function EmptyVault({ compact = false }: { compact?: boolean }) {
  return (
    <Card
      className={`relative overflow-hidden text-center ${compact ? "py-10" : "py-16 sm:py-20"}`}
    >
      <div
        aria-hidden="true"
        className="mx-auto mb-6 flex size-20 items-center justify-center rounded-3xl bg-secondary"
      >
        <Archive strokeWidth={1.4} className="size-9 text-primary" />
      </div>
      <h2 className="font-display text-2xl">
        A little space for everything you love.
      </h2>
      <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-muted-foreground">
        No matching purchases. Try another search or explore all sample Purchase
        Twins.
      </p>
      <Button asChild variant="outline" className="mt-6">
        <Link href="/vault">Show all purchases</Link>
      </Button>
    </Card>
  );
}

export function TwinList({ data, ids }: { data: DemoData; ids?: string[] }) {
  const twins = data.twins.filter((twin) => !ids || ids.includes(twin.id));
  if (!twins.length) return <EmptyVault />;
  return (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {twins.map((twin) => {
        const record = findTwin(data, twin.id);
        if (!record) return null;
        return (
          <Card key={twin.id} className="p-4 sm:p-5">
            <ProductArt kind={record.product.illustration} />
            <div className="mt-5 flex items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">
                {record.product.brand} / {record.product.category}
              </p>
              <span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-semibold">
                {twin.origin === "sandbox" ? "Verified sandbox" : "Sample"}
              </span>
            </div>
            <h2 className="mt-2 text-lg font-semibold">
              {record.product.name}
            </h2>
            <p className="mt-2 text-xs text-muted-foreground">
              {displayDate(twin.purchasedOn)} <span aria-hidden="true">·</span>{" "}
              {money(twin.purchasePriceMinor)}
            </p>
            <div className="mt-5 flex items-center justify-between border-t pt-4">
              <span className="text-xs text-muted-foreground">
                {record.documents.length} document
                {record.documents.length !== 1 && "s"}
              </span>
              <Link
                href={`/vault/${twin.id}`}
                className="inline-flex min-h-11 items-center gap-2 text-xs font-semibold"
              >
                View Twin
                <span className="sr-only"> for {record.product.name}</span>
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

export function DocumentList({ documents }: { documents: CareDocument[] }) {
  if (!documents.length)
    return (
      <Card className="py-12 text-center">
        <FileText
          className="mx-auto mb-5 size-8 text-primary"
          aria-hidden="true"
        />
        <h2 className="font-display text-2xl">Goodbye, lost paperwork.</h2>
        <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-muted-foreground">
          No documents attached. Uploads and manufacturer-manual retrieval are
          not connected in Stage 1.
        </p>
      </Card>
    );
  return (
    <div className="space-y-3">
      {documents.map((document) => (
        <Card
          key={document.id}
          className="flex flex-wrap items-center justify-between gap-4"
        >
          <div className="flex min-w-0 items-center gap-3">
            <FileText
              className="size-5 shrink-0 text-primary"
              aria-hidden="true"
            />
            <div>
              <span className="break-all text-sm font-medium">
                {document.title}
              </span>
              <p className="mt-1 text-xs text-muted-foreground">
                {document.origin === "sandbox"
                  ? "Verified sandbox receipt"
                  : "Sample document"}{" "}
                · plain text
              </p>
            </div>
          </div>
          <Button variant="outline" asChild>
            <a href={`/api/documents/${document.id}/download`}>
              Download<span className="sr-only"> {document.title}</span>
            </a>
          </Button>
        </Card>
      ))}
    </div>
  );
}
