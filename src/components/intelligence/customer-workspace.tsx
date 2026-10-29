"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { CustomerDataset } from "@/lib/intelligence/customer-model";
import { CustomerRecords } from "./customer-records";
import { Button } from "../ui/button";

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
  const [loaded, setLoaded] = useState(false);
  return (
    <>
      <p className="mb-5 max-w-3xl text-sm leading-6 text-muted-foreground">
        Explore the purchases available in this demo, open their paperwork, and
        see what is actually recorded. Samples and verified PayPal Sandbox
        purchases remain labeled throughout.
      </p>
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
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4">
        <p className="text-sm text-muted-foreground">
          {dataset.purchases.length} available purchases ·{" "}
          {dataset.source === "database"
            ? `newest ${dataset.limit} saved purchase window`
            : "bundled sample preview"}
          . Not a complete PayPal purchase history.
        </p>
        {studioAllowed && !loaded && (
          <Button onClick={() => setLoaded(true)}>
            Explore interactive Insights
          </Button>
        )}
      </div>
      {studioAllowed && loaded ? (
        <Studio dataset={dataset} live={live} />
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
