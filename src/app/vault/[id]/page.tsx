import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  FileText,
  Layers2,
  Sparkles,
  BookOpen,
  ShieldCheck,
  CalendarDays,
} from "lucide-react";
import { getDemoData } from "@/lib/demo/repository";
import {
  findTwin,
  displayDate,
  money,
  recordIdSchema,
} from "@/lib/demo/presentation";
import { Shell } from "@/components/shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ProductArt } from "@/components/product-art";
import { DocumentList, PurchaseBadge } from "@/components/vault";
import { Events } from "@/components/events";

export const metadata = { title: "Purchase Twin" };
export default async function TwinPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!recordIdSchema.safeParse(id).success) notFound();
  const data = await getDemoData();
  const record = findTwin(data, id);
  if (!record) notFound();
  const { twin, product, documents, events } = record;
  const verified = twin.origin === "sandbox";
  return (
    <Shell active="/vault" source={data.source}>
      <Link
        href="/vault"
        className="mb-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to purchase vault
      </Link>
      <article
        aria-label="Purchase Twin passport"
        className="passport-frame shadow-card"
      >
        <div className="overflow-hidden rounded-[27px] bg-card">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-4 sm:px-7">
            <span className="inline-flex items-center gap-2 text-sm font-semibold">
              <Layers2 className="size-5 text-primary" aria-hidden="true" />
              Purchase Twin
              <span className="hidden font-normal text-muted-foreground sm:inline">
                / Your digital product passport
              </span>
            </span>
            <PurchaseBadge origin={twin.origin} />
          </header>
          <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[.95fr_1.05fr]">
            <div className="min-w-0 pt-2 lg:col-start-2 lg:row-start-1">
              <p className="section-label">
                {product.brand} · {product.model}
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl xl:text-5xl">
                {product.name}
              </h1>
              <p className="mt-4 text-base leading-7 text-muted-foreground">
                Not just what you bought. The details, documents, and little
                moments that belong with it.
              </p>
            </div>
            <div className="relative min-w-0 lg:col-start-1 lg:row-start-1 lg:row-span-2">
              <ProductArt kind={product.illustration} large />
              <span className="absolute right-4 bottom-4 rounded-full border bg-card px-3 py-1.5 text-xs font-medium text-intelligence-foreground">
                CareOS ready · Intelligence planned
              </span>
            </div>
            <div className="min-w-0 lg:col-start-2">
              <dl className="grid grid-cols-2 gap-x-5 gap-y-6 border-t pt-6">
                {[
                  [
                    verified ? "Sandbox purchase" : "Sample purchase",
                    displayDate(twin.purchasedOn),
                  ],
                  [
                    verified ? "Sandbox price paid" : "Sample price paid",
                    money(twin.purchasePriceMinor),
                  ],
                  [
                    "Fictional merchant",
                    twin.productSnapshot?.merchantName ?? data.merchant.name,
                  ],
                  [
                    "Payment verification",
                    verified
                      ? "COMPLETED · verified server-side"
                      : "Not connected",
                  ],
                ].map(([label, value]) => (
                  <div key={label} className="min-w-0">
                    <dt className="text-sm text-muted-foreground">{label}</dt>
                    <dd className="mt-1.5 break-words text-sm font-semibold tabular-nums">
                      {value}
                    </dd>
                  </div>
                ))}
              </dl>
              <div className="mt-6 rounded-2xl bg-secondary p-4 text-sm leading-7 text-secondary-foreground">
                {verified
                  ? "A completed PayPal Sandbox capture was retrieved and validated on the server. The product and customer are fictional; no real money was used."
                  : "This is a sample Purchase Twin, not a verified PayPal purchase."}
              </div>
            </div>
          </div>
          <div className="passport-divider flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-7">
            <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <FileText className="size-4 text-primary" aria-hidden="true" />
              {documents.length} document{documents.length !== 1 && "s"}{" "}
              connected · {events.length} source-labeled event
              {events.length !== 1 && "s"}
            </span>
            <span className="font-mono text-xs text-muted-foreground">
              Passport PC-{twin.id.slice(-6).toUpperCase()}
            </span>
          </div>
        </div>
      </article>
      <div className="mt-8 grid items-start gap-7 xl:grid-cols-[1.4fr_1fr]">
        <div>
          <section aria-labelledby="documents-heading">
            <div className="mb-5 flex items-center justify-between gap-3">
              <h2 id="documents-heading" className="section-title">
                The paperwork
              </h2>
              <Badge tone="blue">
                <FileText className="size-3.5" aria-hidden="true" />
                Source labeled
              </Badge>
            </div>
            <DocumentList documents={documents} />
          </section>
          <section aria-labelledby="history-heading" className="mt-8">
            <h2 id="history-heading" className="section-title mb-5">
              Care history
            </h2>
            <Events events={events} />
          </section>
          {verified && (
            <section className="mt-8" aria-labelledby="evidence-heading">
              <h2 id="evidence-heading" className="section-title mb-5">
                Sandbox payment evidence
              </h2>
              <Card>
                <dl className="space-y-4 break-all text-sm">
                  {[
                    ["PayPal Sandbox order", twin.paypalOrderId],
                    ["PayPal Sandbox capture", twin.paypalCaptureId],
                    ["Verified at", twin.verifiedAt],
                  ].map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="mt-1 font-mono">{value}</dd>
                    </div>
                  ))}
                </dl>
              </Card>
            </section>
          )}
        </div>
        <div className="space-y-5">
          <section
            aria-labelledby="care-heading"
            className="intelligence-wash rounded-3xl border p-6 sm:p-7"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 text-sm font-semibold text-intelligence-foreground">
                <Sparkles className="size-4" aria-hidden="true" />
                CareOS intelligence
              </span>
              <Badge tone="intelligence">Planned</Badge>
            </div>
            <h2
              id="care-heading"
              className="mt-6 text-2xl font-semibold tracking-tight"
            >
              Care that knows
              <br />
              where to start.
            </h2>
            <h3 className="mt-5 text-base font-semibold">AI Product Care</h3>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              Source-backed setup and troubleshooting are planned. No AI model
              is connected.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {["Setup", "Maintenance", "Troubleshooting"].map((label) => (
                <span
                  key={label}
                  className="rounded-lg border bg-card px-3 py-2 text-xs text-intelligence-foreground"
                >
                  {label} · planned
                </span>
              ))}
            </div>
          </section>
          <Card>
            <h2 className="text-base font-semibold">
              What we know. What we don’t.
            </h2>
            <dl className="mt-5 space-y-5">
              {[
                {
                  icon: BookOpen,
                  label: "Manufacturer manual",
                  value: "Not supplied",
                },
                {
                  icon: ShieldCheck,
                  label: "Warranty coverage",
                  value: "Not supplied or verified",
                },
                {
                  icon: CalendarDays,
                  label: "Returns and recalls",
                  value: "Not verified; live monitoring is not active",
                },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label}>
                  <dt className="flex items-center gap-3 text-sm font-medium">
                    <Icon
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    {label}
                  </dt>
                  <dd className="mt-1 ml-7 text-sm leading-6 text-muted-foreground">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </Card>
        </div>
      </div>
    </Shell>
  );
}
