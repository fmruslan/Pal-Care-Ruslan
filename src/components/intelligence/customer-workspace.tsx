"use client";

import dynamic from "next/dynamic";
import type { CustomerDataset } from "@/lib/intelligence/customer-model";
import { CustomerRecords } from "./customer-records";
import { PurchaseMetrics } from "../purchase-metrics";
import { purchaseTotals } from "@/lib/intelligence/customer-presentation";
import { CustomerHighlights } from "./customer-highlights";

const Studio = dynamic(
  () => import("./customer-studio").then((m) => m.CustomerStudio),
  {
    ssr: false,
    loading: () => (
      <p role="status" className="py-8">
        Preparing your interactive purchase workspace…
      </p>
    ),
  },
);

export function CustomerWorkspace({
  dataset,
  studioAllowed,
  live,
}: {
  dataset: CustomerDataset;
  studioAllowed: boolean;
  live: boolean;
}) {
  const totals = purchaseTotals(dataset.purchases);
  return (
    <>
      {!!dataset.unavailable.length && (
        <p
          role="alert"
          className="mb-5 rounded-xl border bg-warning-surface p-4 text-sm text-warning"
        >
          Some evidence could not be loaded: {dataset.unavailable.join(", ")}.
          Your saved purchases remain available; missing evidence is not an
          all-clear.
        </p>
      )}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="text-sm text-muted-foreground">
          {dataset.purchases.length} available purchases ·{" "}
          {dataset.source === "database"
            ? `newest ${dataset.limit} saved purchase window`
            : "bundled sample preview"}
          . Totals below cover this loaded window, not a complete PayPal
          purchase history.
        </p>
        {studioAllowed && (
          <a
            href="#purchase-workspace"
            className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline"
          >
            Jump to interactive view ↓
          </a>
        )}
      </div>
      <PurchaseMetrics {...totals} />
      <CustomerHighlights purchases={dataset.purchases} />
      {studioAllowed ? (
        <section
          id="purchase-workspace"
          aria-label="Interactive purchase workspace"
          className="scroll-mt-6"
        >
          <Studio dataset={dataset} live={live} />
        </section>
      ) : (
        <>
          {!studioAllowed && (
            <p className="mb-5 text-sm text-muted-foreground">
              Interactive AG Studio requires permitted local evaluation or
              approved judging license configuration. Your purchase records are
              available below.
            </p>
          )}
          <CustomerRecords purchases={dataset.purchases} />
        </>
      )}
    </>
  );
}
