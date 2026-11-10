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
        Preparing your purchase insights…
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
          Some information could not be loaded: {dataset.unavailable.join(", ")}
          . You can still browse your saved purchases. Missing information does
          not mean everything is in order.
        </p>
      )}
      <div className="customer-insights-coverage mb-5 text-sm text-muted-foreground">
        <p className="text-sm text-muted-foreground">
          {dataset.purchases.length} saved purchases shown ·{" "}
          {dataset.source === "database"
            ? `up to your ${dataset.limit} most recent saved purchases`
            : "built-in example purchases"}
          . This view covers saved purchases only, not your complete PayPal
          history. Example purchases and Verified Sandbox records are labeled
          separately.
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
            Interactive charts are not available in this view. You can still
            browse your saved purchases below.
          </p>
          <details className="mb-5 text-xs text-muted-foreground">
            <summary className="min-h-11 cursor-pointer py-3 font-medium">
              Technical details
            </summary>
            <p>
              AG Studio 3.0.0 requires permitted local evaluation or approved
              judging license configuration. Sponsor judging key not yet
              issued/configured. Vendor notices and licensing requirements
              remain unchanged.
            </p>
          </details>
          <CustomerRecords purchases={dataset.purchases} />
        </>
      )}
      <details className="customer-insights-overview mt-6 rounded-2xl border bg-card px-5">
        <summary className="min-h-11 cursor-pointer py-4 text-sm font-semibold">
          Your purchase overview
        </summary>
        <p className="mb-4 text-sm leading-6 text-muted-foreground">
          These counts and suggestions include all purchases loaded on this
          page, before filters. Your interactive view and Purchase details show
          only the purchases you select.
        </p>
        {studioAllowed && <PurchaseMetrics {...totals} />}
        <CustomerHighlights purchases={dataset.purchases} />
      </details>
    </>
  );
}
