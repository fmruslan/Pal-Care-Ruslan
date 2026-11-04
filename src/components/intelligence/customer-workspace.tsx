"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { CustomerDataset } from "@/lib/intelligence/customer-model";
import { CustomerRecords } from "./customer-records";
import { PurchaseMetrics } from "../purchase-metrics";
import { purchaseTotals } from "@/lib/intelligence/customer-presentation";
import { CustomerHighlights } from "./customer-highlights";
import { useInsightsControl } from "./customer-control";

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
  const { registerDeparture } = useInsightsControl();
  const [departing, setDeparting] = useState(false);
  useEffect(
    () => registerDeparture(() => setDeparting(true)),
    [registerDeparture],
  );
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
      <div className="customer-insights-coverage mb-5 text-sm text-muted-foreground">
        <p className="text-sm text-muted-foreground">
          {dataset.purchases.length} available purchases ·{" "}
          {dataset.source === "database"
            ? `newest ${dataset.limit} saved purchase window`
            : "bundled sample preview"}
          . This is the loaded window, not a complete PayPal purchase history.
          Sample and verified Sandbox evidence remain separate.
        </p>
      </div>
      {studioAllowed ? (
        <section
          id="purchase-workspace"
          aria-label="Interactive purchase workspace"
          className="customer-insights-workspace scroll-mt-6"
        >
          {departing ? (
            <p role="status" className="py-8">
              Opening your next view…
            </p>
          ) : (
            <Studio dataset={dataset} live={live} />
          )}
        </section>
      ) : (
        <>
          <PurchaseMetrics {...totals} />
          <p className="mb-5 text-sm text-muted-foreground">
            Interactive AG Studio requires permitted local evaluation or
            approved judging license configuration. Your purchase records are
            available below.
          </p>
          <CustomerRecords purchases={dataset.purchases} />
        </>
      )}
      <details className="customer-insights-overview mt-6 rounded-2xl border bg-card px-5">
        <summary className="min-h-11 cursor-pointer py-4 text-sm font-semibold">
          Loaded-window overview & saved-record suggestions
        </summary>
        <p className="mb-4 text-sm leading-6 text-muted-foreground">
          These counts and suggestions cover the full loaded window, not the
          current Studio selection. Use the interactive view for filtered
          analytics and its matching source records.
        </p>
        {studioAllowed && <PurchaseMetrics {...totals} />}
        <CustomerHighlights purchases={dataset.purchases} />
      </details>
    </>
  );
}
