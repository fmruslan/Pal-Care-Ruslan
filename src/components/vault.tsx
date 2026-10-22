import Link from "next/link";
import {
  ArrowRight,
  Archive,
  FileText,
  Download,
  CalendarDays,
  Layers2,
  Check,
} from "lucide-react";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import type { CareDocument, DemoData } from "@/db/schema";
import { findTwin, money, displayDate } from "@/lib/demo/presentation";
import { ProductArt } from "./product-art";

export function PurchaseBadge({ origin }: { origin: string }) {
  return (
    <Badge tone={origin === "sandbox" ? "success" : "neutral"}>
      {origin === "sandbox" && (
        <Check className="size-3.5" aria-hidden="true" />
      )}
      {origin === "sandbox" ? "Verified sandbox" : "Sample"}
    </Badge>
  );
}

export function EmptyVault({ compact = false }: { compact?: boolean }) {
  return (
    <Card className={`hero-wash text-center ${compact ? "py-10" : "py-16"}`}>
      <span className="mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl bg-secondary">
        <Archive className="size-7 text-primary" aria-hidden="true" />
      </span>
      <h2 className="section-title">A little space for everything you love.</h2>
      <p className="mx-auto mt-4 max-w-md text-base leading-7 text-muted-foreground">
        No matching purchases. Try another search or explore all sample Purchase
        Twins.
      </p>
      <Button asChild variant="outline" className="mt-7">
        <Link href="/vault">
          Show all purchases
          <ArrowRight aria-hidden="true" />
        </Link>
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
          <Card key={twin.id} className="motion-card group p-4 sm:p-5">
            <div className="relative">
              <ProductArt kind={record.product.illustration} />
              <span className="absolute top-3 left-3">
                <PurchaseBadge origin={twin.origin} />
              </span>
              <span className="absolute right-3 bottom-3 rounded-xl border bg-card p-2 text-primary">
                <Layers2 className="size-4" aria-hidden="true" />
              </span>
            </div>
            <div className="px-1 pt-5">
              <p className="text-sm text-muted-foreground">
                {record.product.brand} <span aria-hidden="true">/</span>{" "}
                {record.product.category}
              </p>
              <h2 className="mt-2 text-lg font-semibold tracking-tight">
                {record.product.name}
              </h2>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="size-3.5" aria-hidden="true" />
                  {displayDate(twin.purchasedOn)}
                </span>
                <span className="font-medium tabular-nums text-foreground">
                  {money(twin.purchasePriceMinor)}
                </span>
              </div>
              <div className="passport-divider mt-5 flex flex-wrap items-center justify-between gap-2 pt-3">
                <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                  <FileText className="size-4" aria-hidden="true" />
                  {record.documents.length} document
                  {record.documents.length !== 1 && "s"}
                </span>
                <Link
                  href={`/vault/${twin.id}`}
                  className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary"
                >
                  View Twin
                  <span className="sr-only"> for {record.product.name}</span>
                  <ArrowRight
                    className="size-4 transition-transform group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </Link>
              </div>
              <p className="text-xs text-muted-foreground">
                {record.events.length} source-labeled care event
                {record.events.length !== 1 && "s"}
              </p>
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
        <h2 className="section-title">Goodbye, lost paperwork.</h2>
        <p className="mx-auto mt-4 max-w-md text-sm leading-7 text-muted-foreground">
          No documents attached. Uploads and manufacturer-manual retrieval are
          not connected.
        </p>
      </Card>
    );
  return (
    <div className="space-y-3">
      {documents.map((document) => (
        <Card
          key={document.id}
          className="flex flex-wrap items-center justify-between gap-4 rounded-2xl p-4 sm:p-5"
        >
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-secondary">
              <FileText className="size-5 text-primary" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <span className="break-words text-sm font-semibold">
                {document.title}
              </span>
              <p className="mt-1 text-sm text-muted-foreground">
                {document.origin === "sandbox"
                  ? "Verified sandbox receipt"
                  : "Sample document"}{" "}
                · plain text
              </p>
            </div>
          </div>
          <Button variant="outline" asChild size="sm">
            <Link href={`/documents/${document.id}`}>
              <Download aria-hidden="true" />
              Open<span className="sr-only"> {document.title}</span>
            </Link>
          </Button>
        </Card>
      ))}
    </div>
  );
}
