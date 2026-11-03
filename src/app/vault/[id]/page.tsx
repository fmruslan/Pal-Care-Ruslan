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
import { AssistantName } from "@/components/assistant-name";
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
        className="mb-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to Home
      </Link>
      <article
        id="overview"
        aria-label="Purchase Twin passport"
        className="passport-frame shadow-card"
      >
        <div className="overflow-hidden rounded-[27px] bg-card">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3 sm:px-7">
            <span className="inline-flex items-center gap-2 text-sm font-semibold">
              <Layers2 className="size-5 text-primary" aria-hidden="true" />
              Purchase Twin
              <span className="hidden font-normal text-muted-foreground sm:inline">
                / Your digital product passport
              </span>
            </span>
            <PurchaseBadge origin={twin.origin} />
          </header>
          <div className="grid items-center gap-5 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
            <div className="min-w-0 lg:col-start-2 lg:row-start-1">
              <p className="section-label">
                {product.brand} · {product.model}
              </p>
              <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl xl:text-4xl">
                {product.name}
              </h1>
              <div className="float-right ml-3 size-18 lg:hidden">
                <ProductArt kind={product.illustration} size="thumbnail" />
              </div>
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
                <AskCareOS context={contextOf(record)} />
                <Button asChild variant="outline">
                  <Link href={withLibraryReturn(`/vault/${id}/care`, from)}>
                    <BookOpen aria-hidden="true" />
                    Product care
                  </Link>
                </Button>
              </div>
            </div>
            <div className="relative hidden min-w-0 lg:col-start-1 lg:row-start-1 lg:block">
              <ProductArt kind={product.illustration} size="compact" />
              <span className="mt-2 block text-xs font-medium text-intelligence-foreground">
                {careSources.length
                  ? "Source-backed care available"
                  : "Pal Care · Purchase assistance"}
              </span>
            </div>
            <div className="min-w-0 lg:col-span-2">
              <dl className="grid grid-cols-2 gap-x-5 gap-y-4 border-t pt-4 sm:grid-cols-4">
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
              <div className="mt-4 rounded-xl bg-secondary px-4 py-3 text-sm leading-6 text-secondary-foreground">
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
      <nav
        aria-label="Purchase sections"
        className="my-5 flex flex-wrap gap-2 border-b pb-2 text-sm font-semibold text-primary"
      >
        {[
          ["#overview", "Overview"],
          ["#documents", `Documents (${documents.length})`],
          ["#care-history", "Care & History"],
        ].map(([href, label]) => (
          <a
            key={href}
            href={href}
            className="inline-flex min-h-11 items-center rounded-xl px-3 hover:bg-secondary"
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
      <div className="mt-8 grid grid-cols-1 items-start gap-7 xl:grid-cols-[1.4fr_1fr]">
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
            className="intelligence-wash rounded-3xl border p-6 sm:p-7"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="inline-flex min-w-0 max-w-full flex-wrap items-center gap-2 text-sm font-semibold text-intelligence-foreground">
                <AssistantName /> <span>· Purchase guidance</span>
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
                : `No manufacturer care guide is available for ${product.brand} ${product.model}. North Star can still find your receipt and explain saved purchase details.`}{" "}
              No live AI model is connected in fixture mode.
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
