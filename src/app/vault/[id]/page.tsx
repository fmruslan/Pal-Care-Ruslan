import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  FileText,
  Layers2,
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
import {
  libraryReturn,
  withLibraryReturn,
  type LibraryParams,
} from "@/lib/library-navigation";

export const metadata = { title: "Purchase Twin" };
export default async function TwinPage({
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
        href={from}
        className="mb-3 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to Purchases
      </Link>
      <article
        id="overview"
        aria-label="Purchase Twin passport"
        className="customer-purchase-hero overflow-hidden rounded-2xl border bg-card"
      >
        <div>
          <header className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 sm:px-7 sm:pt-6">
            <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Layers2 className="size-4 text-primary" aria-hidden="true" />
              Purchase Twin
            </span>
            <PurchaseBadge origin={twin.origin} />
          </header>
          <div className="customer-purchase-identity grid items-center gap-5 p-5 sm:gap-7 sm:p-7">
            <div className="customer-purchase-art min-w-0">
              <ProductArt kind={product.illustration} size="compact" />
            </div>
            <div className="min-w-0">
              <p className="section-label">
                {product.brand} · {product.model}
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
                {product.name}
              </h1>
              <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
                <time dateTime={twin.purchasedOn}>
                  {displayDate(twin.purchasedOn)}
                </time>
                <span className="font-semibold tabular-nums text-foreground">
                  {reference
                    ? "Reference sample · amount unavailable"
                    : `${verified ? "Sandbox" : "Sample"} amount ${money(twin.purchasePriceMinor)}`}
                </span>
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Fictional merchant ·{" "}
                {twin.productSnapshot?.merchantName ?? data.merchant.name}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {documents
                  .filter((d) => d.kind === "receipt")
                  .map((d) => (
                    <Button asChild key={d.id}>
                      <Link
                        href={withLibraryReturn(`/documents/${d.id}`, from)}
                      >
                        <FileText aria-hidden="true" />
                        View receipt
                      </Link>
                    </Button>
                  ))}
                <AskCareOS
                  context={contextOf(record)}
                  label="Ask North about this purchase"
                />
                <Button asChild variant="outline">
                  <Link href={withLibraryReturn(`/vault/${id}/care`, from)}>
                    <BookOpen aria-hidden="true" />
                    Product care
                  </Link>
                </Button>
                <Link
                  href={`/care/${id}`}
                  className="inline-flex min-h-11 items-center text-sm font-semibold text-primary"
                >
                  Prices, returns & warranty
                </Link>
              </div>
            </div>
          </div>
          <div className="border-t px-5 py-4 sm:px-7">
            <p className="text-sm leading-6 text-muted-foreground">
              {verified
                ? "COMPLETED · verified server-side. A completed PayPal Sandbox capture was retrieved and validated. Fictional product and customer; no real money."
                : reference
                  ? "Reference sample ownership only, not a verified PayPal purchase. Its placeholder amount is not a product price."
                  : "Sample Purchase Twin · not a verified PayPal purchase."}
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 px-5 pb-5 text-xs text-muted-foreground sm:px-7">
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
      <nav
        aria-label="Purchase sections"
        className="customer-purchase-jumps my-5 flex flex-wrap gap-1 border-b pb-2 text-sm font-semibold"
      >
        {[
          ["#overview", "Overview"],
          ["#documents", `Documents (${documents.length})`],
          ["#care-history", "Care & History"],
        ].map(([href, label]) => (
          <a
            key={href}
            href={href}
            className="inline-flex min-h-11 items-center rounded-lg px-3 text-foreground hover:bg-secondary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {label}
          </a>
        ))}
      </nav>
      {adjustment && (
        <section className="mt-7" aria-label="Price Guardian adjustment">
          <GuardianCard item={adjustment} />
        </section>
      )}
      <div className="customer-purchase-sections mt-6 grid grid-cols-1 items-start gap-7 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <section id="documents" aria-labelledby="documents-heading">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <h2 id="documents-heading" className="section-title">
                Documents
              </h2>
              <Badge tone="blue">
                <FileText className="size-3.5" aria-hidden="true" />
                Source labeled
              </Badge>
            </div>
            <DocumentList documents={documents} from={from} />
          </section>
          <section
            id="care-history"
            aria-labelledby="history-heading"
            className="mt-8"
          >
            <h2 id="history-heading" className="section-title mb-5">
              Care & History
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
            <details className="mt-8 rounded-2xl border bg-card p-5">
              <summary
                id="evidence-heading"
                className="min-h-11 cursor-pointer text-base font-semibold"
              >
                Sandbox payment evidence
              </summary>
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
            </details>
          )}
        </div>
        <div className="space-y-5">
          <section
            aria-labelledby="care-heading"
            className="rounded-2xl border bg-card p-5 sm:p-6"
          >
            <h2
              id="care-heading"
              className="text-lg font-semibold tracking-tight"
            >
              Product care
            </h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              {careSources.length
                ? "Explore matched manufacturer guidance for this reference product. Ownership is sample-only; documentation has its own source."
                : `No manufacturer care guide is available for ${product.brand} ${product.model}. North Star can still find your receipt and explain saved purchase details.`}{" "}
              Guidance availability does not establish warranty or recall
              status.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link href={withLibraryReturn(`/vault/${id}/care`, from)}>
                  Explore available guidance
                </Link>
              </Button>
            </div>
          </section>
          <Card>
            <h2 className="text-base font-semibold">Record coverage</h2>
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
