import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { ProductArt } from "@/components/product-art";
import {
  AskCareOS,
  CareContextRegistration,
} from "@/components/careos/provider";
import { ReturnDraft } from "@/components/care/return-draft";
import { getDemoData } from "@/lib/demo/repository";
import {
  findTwin,
  displayDate,
  money,
  recordIdSchema,
} from "@/lib/demo/presentation";
import { contextOf } from "@/lib/careos/contracts";
import { getGuardian } from "@/lib/price-guardian/runtime";
import { GuardianCard } from "@/components/guardian";
import { GuardianTimeline } from "@/components/guardian-timeline";
import { getSavedCare } from "@/lib/care/persistence-runtime";
import { evidenceLabel, returnTimeline } from "@/lib/care/contracts";

export const metadata = { title: "Product care details" };
export default async function CareDetails({
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
  const catalog = data.products.find(
    (p) =>
      p.id === product.id &&
      p.merchantId === twin.merchantId &&
      p.model === product.model &&
      p.brand === product.brand,
  );
  const receipt = documents.find((d) => d.kind === "receipt");
  const guardian = await getGuardian(id).then(
    (value) => value.cases,
    () => null,
  );
  const returns = events.filter((e) => e.kind === "return");
  const policies = documents.filter((d) => d.kind === "policy");
  const saved = await getSavedCare().catch(() => null);
  const milestones = returnTimeline(id, saved?.returns ?? []);
  const warranties = saved?.warranties.filter((r) => r.twinId === id) ?? [];
  const watches = saved?.watches.filter((r) => r.twinId === id) ?? [];
  return (
    <Shell active="/dashboard" source={data.source}>
      <CareContextRegistration context={contextOf(record)} />
      <Link
        href="/dashboard"
        className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm text-muted-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        Back to Care
      </Link>
      <header className="flex flex-wrap items-center gap-5">
        <ProductArt kind={product.illustration} size="thumbnail" />
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">
            {product.model} · {displayDate(twin.purchasedOn)} ·{" "}
            {twin.origin === "sandbox"
              ? "Verified Sandbox payment"
              : "Sample purchase"}
          </p>
          <h1 className="mt-1 text-2xl font-semibold">
            Care for your {product.name.toLowerCase()}
          </h1>
        </div>
      </header>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <AskCareOS
          context={contextOf(record)}
          label="Ask North about this purchase"
        />
        <Link
          href={`/vault/${id}`}
          className="inline-flex min-h-11 items-center text-sm font-semibold text-primary"
        >
          Purchase & documents
        </Link>
      </div>
      <nav
        aria-label="Care details"
        className="my-6 flex flex-wrap gap-x-5 gap-y-1 border-b pb-3 text-sm font-semibold"
      >
        {[
          ["price", "Prices"],
          ["returns", "Returns"],
          ["refunds", "Refunds"],
          ["warranty", "Warranty"],
          ["guidance", "Product care"],
        ].map(([anchor, label]) => (
          <a
            key={anchor}
            href={`#${anchor}`}
            className="inline-flex min-h-11 items-center text-primary"
          >
            {label}
          </a>
        ))}
      </nav>
      <div className="max-w-3xl space-y-6">
        {(saved === null || !saved.complete) && (
          <p
            role="status"
            className="rounded-xl border p-4 text-sm text-muted-foreground"
          >
            Saved Care tracking is unavailable. Missing records are not
            confirmation that no return, warranty or watch exists.
          </p>
        )}
        <section
          id="price"
          aria-labelledby="price-heading"
          className="scroll-mt-6 rounded-2xl border bg-card p-5 sm:p-6"
        >
          <h2 id="price-heading" className="text-lg font-semibold">
            Price comparison
          </h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-sm text-muted-foreground">
                {twin.origin === "sample"
                  ? "Original sample amount"
                  : "Paid in Sandbox"}
              </dt>
              <dd className="mt-1 text-lg font-semibold">
                {twin.purchasePriceMinor > 0
                  ? money(twin.purchasePriceMinor)
                  : "Reference amount unavailable"}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">
                Current fictional merchant catalog
              </dt>
              <dd className="mt-1 text-lg font-semibold">
                {catalog && twin.purchasePriceMinor > 0
                  ? money(catalog.priceMinor)
                  : "No comparable price available"}
              </dd>
            </div>
          </dl>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            {data.merchant.name} · same model and variant only. Read on this
            visit, not a historical price observation or continuous monitoring.
            A price difference does not establish refund eligibility. Existing
            demo-v1 purchases are not retroactively covered by the later price
            promise.
          </p>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            {watches.length
              ? "Saved watch details below reflect recorded checks, not real-time market monitoring. The private operator can pause one or all watches, or disable the checker completely."
              : process.env.CARE_RECORDS_ENABLED === "true"
                ? "No watch is available in these loaded records. Incomplete or unavailable records do not establish that monitoring is inactive."
                : "Price watches are not active. Scheduled checking and durable watch preferences require the separately approved worker and write capability; no watch was created."}
          </p>
          {watches.map((watch) => (
            <dl
              key={watch.id}
              className="mt-4 space-y-2 text-sm text-muted-foreground"
            >
              <div>
                <dt className="font-semibold text-foreground">
                  Recorded watch state
                </dt>
                <dd>{watch.state} · fixed fictional catalog only</dd>
              </div>
              <div>
                <dt>Last successful check</dt>
                <dd>{watch.lastCheckedAt ?? "Not recorded"}</dd>
              </div>
              <div>
                <dt>Last recorded catalog price</dt>
                <dd>
                  {watch.observedMinor === null
                    ? "Not recorded"
                    : money(watch.observedMinor)}
                </dd>
              </div>
              <div>
                <dt>Next check due</dt>
                <dd>{watch.nextCheckAt ?? "Not scheduled"}</dd>
              </div>
              <div>
                <dt>Expiry</dt>
                <dd>{watch.expiresAt}</dd>
              </div>
            </dl>
          ))}
          {receipt && (
            <Link
              href={`/documents/${receipt.id}`}
              className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline"
            >
              View original receipt
            </Link>
          )}
        </section>
        <section
          id="returns"
          aria-labelledby="returns-heading"
          className="scroll-mt-6 rounded-2xl border bg-card p-5 sm:p-6"
        >
          <h2 id="returns-heading" className="text-lg font-semibold">
            Return progress
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            No verified return request, carrier tracking or merchant acceptance
            is connected to this purchase. Fictional goods do not ship. There is
            no confirmed return deadline.
          </p>
          {milestones.length > 0 && (
            <ol
              className="mt-5 space-y-4 border-l pl-4"
              aria-label="Recorded return timeline"
            >
              {milestones.map((milestone) => (
                <li key={milestone.id}>
                  <p className="text-sm font-semibold">
                    {milestone.state.replaceAll("_", " ")}
                  </p>
                  <time
                    dateTime={milestone.evidence.effectiveOn}
                    className="text-sm text-muted-foreground"
                  >
                    {displayDate(milestone.evidence.effectiveOn)}
                  </time>
                  <p className="text-sm text-muted-foreground">
                    {evidenceLabel(milestone.evidence)} ·{" "}
                    {milestone.evidence.reference}
                  </p>
                </li>
              ))}
            </ol>
          )}
          {returns.length > 0 && (
            <>
              <h3 className="mt-5 text-sm font-semibold">
                Saved historical notes · not a return timeline
              </h3>
              <ol
                className="mt-3 space-y-4 border-l pl-4"
                aria-label="Saved return notes"
              >
                {returns.map((e) => (
                  <li key={e.id}>
                    <p className="text-sm font-semibold">{e.title}</p>
                    <time
                      dateTime={e.occurredOn}
                      className="text-xs text-muted-foreground"
                    >
                      {displayDate(e.occurredOn)} · Fictional sample event
                    </time>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {e.description}
                    </p>
                  </li>
                ))}
              </ol>
            </>
          )}
          <ReturnDraft
            name={product.name}
            model={product.model}
            purchasedOn={twin.purchasedOn}
            origin={twin.origin}
            receipt={receipt ? `/documents/${receipt.id}` : null}
          />
        </section>
        <section
          id="refunds"
          aria-labelledby="refunds-heading"
          className="scroll-mt-6 rounded-2xl border bg-card p-5 sm:p-6"
        >
          <h2 id="refunds-heading" className="mb-4 text-lg font-semibold">
            Refund evidence
          </h2>
          {guardian === null ? (
            <p className="text-sm text-muted-foreground">
              Refund records are temporarily unavailable. This is not
              confirmation that no refund exists.
            </p>
          ) : guardian.length ? (
            guardian.map((item) => (
              <div key={item.id}>
                <GuardianCard item={item} />
                <GuardianTimeline item={item} />
              </div>
            ))
          ) : (
            <p className="text-sm leading-6 text-muted-foreground">
              No verified refund is recorded in the available evidence. A
              verified Sandbox purchase is not a refund. This page cannot
              approve or send money.
            </p>
          )}
        </section>
        <section
          id="warranty"
          aria-labelledby="warranty-heading"
          className="scroll-mt-6 rounded-2xl border bg-card p-5 sm:p-6"
        >
          <h2 id="warranty-heading" className="text-lg font-semibold">
            Warranty information
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            No verified warranty expiration date is recorded. A purchase date,
            return reminder or payment verification does not establish warranty
            coverage. Fictional demo goods have no real warranty.
          </p>
          {warranties.map((warranty) => (
            <div
              key={warranty.evidence.reference}
              className="mt-4 border-t pt-4 text-sm leading-6"
            >
              <p className="font-semibold">
                Recorded date: {displayDate(warranty.expiresOn)}
              </p>
              <p>{warranty.basis}</p>
              <p className="text-muted-foreground">
                {evidenceLabel(warranty.evidence)} ·{" "}
                {warranty.evidence.reference}. This is not verified warranty
                coverage.
              </p>
            </div>
          ))}
          {policies.length > 0 && (
            <ul className="mt-3 list-disc pl-5">
              {policies.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/documents/${p.id}`}
                    className="inline-flex min-h-11 items-center text-sm text-primary underline"
                  >
                    {p.title} ·{" "}
                    {p.origin === "sample" ? "sample document" : "saved record"}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section
          id="guidance"
          aria-labelledby="guidance-heading"
          className="scroll-mt-6 rounded-2xl border bg-card p-5 sm:p-6"
        >
          <h2 id="guidance-heading" className="text-lg font-semibold">
            Product care & safety
          </h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Review exact-product sources and their coverage limits. Missing
            manuals are not substituted with guidance for another model; saved
            recall assessments do not establish an all-clear.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button asChild variant="outline">
              <Link href={`/vault/${id}/care`}>Available product guidance</Link>
            </Button>
            <Link
              href={`/safety?twinId=${id}`}
              className="inline-flex min-h-11 items-center text-sm font-semibold text-primary"
            >
              Safety evidence
            </Link>
          </div>
        </section>
      </div>
    </Shell>
  );
}
