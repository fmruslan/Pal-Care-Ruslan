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
import { PurchaseActivity } from "@/components/purchase-activity";
import { projectActivity } from "@/lib/careos/activity";
import {
  AskCareOS,
  CareContextRegistration,
} from "@/components/careos/provider";
import { contextOf } from "@/lib/careos/contracts";
import { Button } from "@/components/ui/button";
import { getKnowledge } from "@/lib/careos/knowledge-repository";
import { REFERENCE_PRODUCT } from "@/lib/careos/knowledge";
import { getGuardian } from "@/lib/price-guardian/runtime";
import { GuardianCard } from "@/components/guardian";
import { GuardianTimeline } from "@/components/guardian-timeline";
import { getSafety, getTwinRecallHistory } from "@/lib/safety/runtime";
import { assess } from "@/lib/safety/service";
import { SafetyCard } from "@/components/safety-card";

export const metadata = { title: "Purchase Twin" };
export default async function TwinPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!recordIdSchema.safeParse(id).success) notFound();
  const data = await getDemoData(id);
  const record = findTwin(data, id);
  if (!record) notFound();
  const { twin, product, documents, events } = record;
  const verified = twin.origin === "sandbox";
  const reference = product.id === REFERENCE_PRODUCT;
  const adjustment = (await getGuardian(twin.id)).cases.find(
    (c) => c.twinId === twin.id,
  );
  const [safety, recallHistory] = await Promise.all([
    getSafety(),
    getTwinRecallHistory(twin.id),
  ]);
  const careSources = (await getKnowledge()).filter(
    (s) =>
      s.productId === product.id &&
      s.model === product.model &&
      s.brand === product.brand &&
      s.status === "approved",
  );
  return (
    <Shell active="/vault" source={data.source}>
      <CareContextRegistration context={contextOf(record)} />
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
                {careSources.length
                  ? "Source-backed care available"
                  : "CareOS · Purchase assistance"}
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
                    reference
                      ? "Not a purchase · reference sample"
                      : money(twin.purchasePriceMinor),
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
              <div className="mt-5 flex flex-wrap gap-3">
                {documents
                  .filter((d) => d.kind === "receipt")
                  .map((d) => (
                    <Button asChild key={d.id}>
                      <Link href={`/documents/${d.id}`}>
                        <FileText aria-hidden="true" />
                        View receipt
                      </Link>
                    </Button>
                  ))}
                <AskCareOS context={contextOf(record)} />
                <Button asChild variant="outline">
                  <Link href={`/vault/${id}/care`}>
                    <BookOpen aria-hidden="true" />
                    Product care
                  </Link>
                </Button>
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
      {adjustment && (
        <section className="mt-7" aria-label="Price Guardian adjustment">
          <GuardianCard item={adjustment} />
        </section>
      )}
      <div className="mt-8 grid grid-cols-1 items-start gap-7 xl:grid-cols-[1.4fr_1fr]">
        <div className="min-w-0">
          <section aria-labelledby="documents-heading">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
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
            <PurchaseActivity
              activity={projectActivity(
                { ...data, twins: [twin], documents, events },
                adjustment ? [adjustment] : [],
                recallHistory.map((r) => ({ ...r, twinId: twin.id })),
              )}
            />
            {adjustment && <GuardianTimeline item={adjustment} />}
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
              <Badge tone="intelligence">Available documents only</Badge>
            </div>
            <h2
              id="care-heading"
              className="mt-6 text-2xl font-semibold tracking-tight"
            >
              A useful next step.
            </h2>
            <h3 className="mt-5 text-base font-semibold">Product care</h3>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              {careSources.length
                ? "Explore matched manufacturer guidance for this reference product. Ownership is sample-only; documentation has its own source."
                : `No manufacturer care guide is available for ${product.brand} ${product.model}. CareOS can still find your receipt and explain saved purchase details.`}{" "}
              No live AI model is connected in fixture mode.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link href={`/vault/${id}/care`}>
                  Explore available guidance
                </Link>
              </Button>
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
                  value: careSources.length
                    ? "Matched official guidance available"
                    : "Not supplied",
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
                    <span className="min-w-0 break-words">{label}</span>
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
      <section className="mt-7" aria-label="Recall Guardian evidence">
        <SafetyCard
          twinId={twin.id}
          decision={assess(
            {
              brand: product.brand,
              model: product.model,
              identifiersVerified: false,
            },
            safety.snapshot.hash,
          )}
        />
        <p className="mt-3 text-xs leading-6 text-muted-foreground">
          Limited to official CPSC notice 24-159 ·{" "}
          {safety.mode === "bundled_official_snapshot"
            ? "bundled historical source"
            : "saved official retrieval"}{" "}
          · not continuous monitoring or a safety certification.
        </p>
        {recallHistory.length > 0 && (
          <details className="mt-4 rounded-xl border p-4">
            <summary className="min-h-11 cursor-pointer text-sm font-semibold">
              Saved recall assessment history
            </summary>
            <ol className="mt-3 space-y-4">
              {recallHistory.map((e) => (
                <li key={e.id} className="text-sm leading-7">
                  <p>
                    {e.state.replaceAll("_", " ")} · {e.reason}
                  </p>
                  <time
                    dateTime={e.at}
                    className="text-xs text-muted-foreground"
                  >
                    {e.at}
                  </time>
                  <p className="break-all font-mono text-xs text-muted-foreground">
                    {e.hash}
                  </p>
                </li>
              ))}
            </ol>
          </details>
        )}
      </section>
    </Shell>
  );
}
