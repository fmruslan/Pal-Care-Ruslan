"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  recordsResultSchema,
  type RecordsResult,
  type RecordTotal,
} from "@/lib/careos/records/contracts";
import { Button } from "../ui/button";
import { useInsightsControl } from "../intelligence/customer-control";

const usd = (minor: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    minor / 100,
  );
function Totals({
  totals,
  partial,
}: {
  totals: RecordTotal[];
  partial: boolean;
}) {
  return (
    <dl className="grid gap-3 sm:grid-cols-2">
      {totals.map((total) => (
        <div key={total.origin} className="rounded-xl border p-3">
          <dt className="text-sm text-muted-foreground">
            {total.origin === "sample"
              ? "Sample purchase value"
              : "Verified Sandbox purchase value"}
            {partial ? " · partial evidence" : ""}
          </dt>
          <dd className="mt-1 text-xl font-semibold">
            {usd(total.amountMinor)}
          </dd>
          <dd className="mt-1 text-xs text-muted-foreground">
            {total.pricedCount} priced · {total.excludedCount}{" "}
            unpriced/reference excluded
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Values/identities are computed on the server; the model cannot supply links. */
export function RecordsResultView({
  result: raw,
  onNavigate,
  autoApply = false,
  onAutoApplyStarted,
  presentation = "transcript",
  headingLevel = 3,
}: {
  result: RecordsResult;
  onNavigate: () => void;
  autoApply?: boolean;
  onAutoApplyStarted?: () => void;
  presentation?: "inline" | "transcript";
  headingLevel?: 2 | 3;
}) {
  const ResultHeading = headingLevel === 2 ? "h2" : "h3";
  const [shown, setShown] = useState(10);
  const [copied, setCopied] = useState(false);
  const [applying, setApplying] = useState(false);
  const [chartStatus, setChartStatus] = useState("");
  const insights = useInsightsControl();
  const router = useRouter();
  const pathname = usePathname();
  const started = useRef(false);
  const active = useRef<AbortController | null>(null);
  const applyRecords = insights.applyRecords;
  const applyChart = useCallback(async () => {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setApplying(true);
    setChartStatus("");
    try {
      await applyRecords(
        recordsResultSchema.parse(raw),
        AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
      );
      controller.signal.throwIfAborted();
      setChartStatus(
        "Native chart, separate USD KPIs, filters and matching purchase rows were executed and verified in Insights. Purchase records are unchanged.",
      );
      if (presentation === "inline") {
        const title = [
          ...document.querySelectorAll<HTMLElement>(
            ".ag-studio-layout-widget-title",
          ),
        ].find((node) => node.textContent?.trim() === "Recorded value (USD)");
        title
          ?.closest(".ag-studio-layout-widget")
          ?.scrollIntoView({ block: "center", behavior: "instant" });
      }
    } catch {
      setChartStatus(
        "The native chart could not be verified or was stopped. An already-applied view may remain; no rollback, success or automatic retry is implied. Saved records are unchanged.",
      );
    } finally {
      active.current = null;
      setApplying(false);
    }
  }, [applyRecords, raw, presentation]);
  useEffect(() => () => active.current?.abort(), []);
  useEffect(() => {
    if (!autoApply || raw.query.format !== "chart" || started.current) return;
    if (pathname !== "/insights") {
      router.push("/insights");
      return;
    }
    if (!insights.connected) return;
    // Begin against the committed native workspace, not during React's effect
    // flush. Cleanup cancels an unstarted handoff on navigation/supersession.
    const frame = requestAnimationFrame(() => {
      if (started.current) return;
      started.current = true;
      // Consume the root's transient intent before execution. This component
      // remounts when the dialog reopens; its local ref alone cannot prevent replay.
      onAutoApplyStarted?.();
      void applyChart();
    });
    return () => cancelAnimationFrame(frame);
  }, [
    autoApply,
    raw.query.format,
    pathname,
    router,
    insights.connected,
    applyChart,
    onAutoApplyStarted,
  ]);
  const parsed = recordsResultSchema.safeParse(raw);
  if (!parsed.success)
    return (
      <p role="alert">
        This saved result could not be validated. No amount or link is inferred.
      </p>
    );
  const result = parsed.data;
  const rows = result.records.slice(0, shown);
  const summaries = result.query.operation !== "list";
  const items = rows.map((r) => (
    <li
      key={r.id}
      className={
        result.query.format === "bullets" ? "py-2" : "rounded-xl border p-3"
      }
    >
      <Link
        href={`/vault/${r.id}`}
        onClick={onNavigate}
        className="inline-flex min-h-11 items-center font-semibold text-primary underline"
      >
        {r.name} · {r.model}
      </Link>
      <p className="text-sm text-muted-foreground">
        {r.purchasedOn} ·{" "}
        {r.origin === "sample" ? "Sample" : "Verified Sandbox"} · PC-
        {r.id.slice(-6).toUpperCase()} · {r.category}
      </p>
      <p className="text-sm">
        {r.amountMinor === null
          ? "Recorded price unavailable / reference item"
          : usd(r.amountMinor)}
      </p>
      {r.receiptId ? (
        <Link
          href={`/documents/${r.receiptId}`}
          onClick={onNavigate}
          className="inline-flex min-h-11 items-center text-sm text-primary underline"
        >
          Open receipt
        </Link>
      ) : (
        <p className="text-sm text-muted-foreground">No saved receipt</p>
      )}
      {!!r.documents.length && (
        <details open={result.query.document !== "any"}>
          <summary className="min-h-11 cursor-pointer py-3 text-sm">
            Saved documents ({r.documents.length})
          </summary>
          <ul>
            {r.documents.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/documents/${d.id}`}
                  onClick={onNavigate}
                  className="inline-flex min-h-11 items-center text-sm text-primary underline"
                >
                  {d.title}
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  ));
  return (
    <div
      className={`space-y-4 ${presentation === "inline" ? "north-native-records" : ""}`}
      data-records-result
      data-snapshot-id={result.snapshotId}
    >
      <details className="text-xs text-muted-foreground">
        <summary className="min-h-11 cursor-pointer py-3">
          {result.coverage.complete
            ? "Complete available saved library"
            : "Partial saved library"}{" "}
          ·{" "}
          {result.coverage.source === "fixtures"
            ? "Fictional sample preview"
            : "Saved database records"}
        </summary>
        <p>
          {result.coverage.availableCount} validated available records ·{" "}
          {result.coverage.complete
            ? "complete available library"
            : `partial library; read limit ${result.coverage.limit}`}{" "}
          · observed {result.observedAt} ·{" "}
          {result.coverage.excludedInvalidCount} invalid records excluded. Saved
          records only, not complete PayPal account history. Observation and
          query use UTC; Sample and Verified Sandbox remain distinct.
        </p>
      </details>
      {summaries && (
        <Totals totals={result.totals} partial={!result.coverage.complete} />
      )}
      {!!result.groups.length &&
        (result.query.operation === "breakdown" ||
          result.query.operation === "compare") && (
          <details
            open={result.query.format !== "chart"}
            className="space-y-3"
            aria-label="Recorded value by category"
          >
            <summary className="min-h-11 cursor-pointer py-3 font-semibold">
              Category value details ({result.groups.length})
            </summary>
            {result.groups.map((group) => (
              <section key={group.label}>
                <ResultHeading className="font-semibold">
                  {group.label} · {group.recordIds.length} purchases
                </ResultHeading>
                <Totals
                  totals={group.totals}
                  partial={!result.coverage.complete}
                />
              </section>
            ))}
          </details>
        )}
      {result.comparison && (
        <section className="space-y-2">
          <ResultHeading className="font-semibold">
            Previous period: {result.comparison.from} through{" "}
            {result.comparison.to}
          </ResultHeading>
          <Totals
            totals={result.comparison.totals}
            partial={!result.coverage.complete}
          />
          <p className="text-sm text-muted-foreground">
            {result.comparison.records.length} purchases in the previous period.
            Recorded values only; no causal trend or complete account history is
            inferred.
          </p>
          <details>
            <summary className="min-h-11 cursor-pointer py-3">
              Inspect previous-period purchases
            </summary>
            <ul className="list-disc pl-5">
              {result.comparison.records.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/vault/${r.id}`}
                    onClick={onNavigate}
                    className="inline-flex min-h-11 items-center text-primary underline"
                  >
                    {r.name} · {r.purchasedOn} ·{" "}
                    {r.origin === "sample" ? "Sample" : "Verified Sandbox"}
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}
      {result.query.format === "chart" && (
        <p
          role="status"
          className="rounded-xl border p-3 text-sm text-muted-foreground"
        >
          {chartStatus ||
            "Native chart execution is not yet confirmed. Open Insights, then apply this exact saved result; missing or changed records will be rejected."}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {insights.connected && (
          <Button
            variant="intelligence"
            disabled={applying}
            onClick={() => void applyChart()}
          >
            {applying ? "Applying saved analysis…" : "Show native chart"}
          </Button>
        )}
        {applying && (
          <Button
            variant="outline"
            onClick={() => {
              active.current?.abort();
              insights.cancelRecords();
            }}
          >
            Cancel chart
          </Button>
        )}
        <Button
          variant="outline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(
                result.records
                  .map(
                    (r) =>
                      `• ${r.name} · ${r.model} — ${r.purchasedOn} — ${r.origin === "sample" ? "Sample" : "Verified Sandbox"} — ${r.amountMinor === null ? "Price unavailable" : usd(r.amountMinor)} — /vault/${r.id}`,
                  )
                  .join("\n"),
              );
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? "List copied" : "Copy list"}
        </Button>
        <Link
          href="/insights"
          className="inline-flex min-h-11 items-center px-3 text-sm text-primary underline"
          onClick={() => {
            onNavigate();
            if (pathname === "/insights") {
              const title = [
                ...document.querySelectorAll<HTMLElement>(
                  ".ag-studio-layout-widget-title",
                ),
              ].find((node) =>
                node.textContent?.startsWith("Recorded value (USD)"),
              );
              title
                ?.closest(".ag-studio-layout-widget")
                ?.scrollIntoView({ block: "start", behavior: "instant" });
            }
          }}
        >
          {pathname === "/insights" ? "View chart workspace" : "Open Insights"}
        </Link>
      </div>
      {chartStatus && result.query.format !== "chart" && (
        <p role="status" className="rounded-xl border p-3 text-sm">
          {chartStatus}
        </p>
      )}
      <ResultHeading className="font-semibold">
        {summaries ? "Purchases behind these numbers" : "Matching purchases"} (
        {result.records.length})
      </ResultHeading>
      {!rows.length && (
        <p>
          No matching saved purchases. Filters have not been removed to
          manufacture a result.
        </p>
      )}
      {result.query.format === "table" ? (
        <>
          <div
            role="region"
            aria-label="Scrollable saved-purchase table"
            tabIndex={0}
            className={`${presentation === "inline" ? "hidden md:block" : ""} overflow-x-auto rounded-lg focus-visible:outline-2 focus-visible:outline-ring`}
          >
            <table className="w-full min-w-[44rem] text-left text-sm">
              <caption className="sr-only">Matching saved purchases</caption>
              <thead>
                <tr>
                  {[
                    "Purchase",
                    "Date",
                    "Evidence",
                    "Recorded USD",
                    "Documents",
                  ].map((h) => (
                    <th key={h} className="p-2 whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="p-2">
                      <Link
                        href={`/vault/${r.id}`}
                        onClick={onNavigate}
                        className="inline-flex min-h-11 items-center text-primary underline"
                      >
                        {r.name} · {r.model}
                      </Link>
                    </td>
                    <td className="p-2 whitespace-nowrap">{r.purchasedOn}</td>
                    <td className="p-2 whitespace-nowrap">
                      {r.origin === "sample" ? "Sample" : "Verified Sandbox"}
                    </td>
                    <td className="p-2 whitespace-nowrap">
                      {r.amountMinor === null
                        ? "Unavailable"
                        : usd(r.amountMinor)}
                    </td>
                    <td className="p-2">
                      <ul>
                        {r.documents.map((d) => (
                          <li key={d.id}>
                            <Link
                              href={`/documents/${d.id}`}
                              onClick={onNavigate}
                              className="inline-flex min-h-11 items-center text-primary underline"
                            >
                              {d.title}
                            </Link>
                          </li>
                        ))}
                      </ul>
                      {!r.documents.length && "No saved documents"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {presentation === "inline" && (
            <ul
              className="space-y-3 md:hidden"
              aria-label="Matching saved purchases"
            >
              {items}
            </ul>
          )}
        </>
      ) : (
        <ul
          className={
            result.query.format === "bullets"
              ? "list-disc space-y-2 pl-5"
              : "space-y-3"
          }
          aria-label="Matching saved purchases"
        >
          {items}
        </ul>
      )}
      {shown < result.records.length && (
        <Button
          variant="outline"
          onClick={() =>
            setShown((n) => Math.min(n + 20, result.records.length))
          }
        >
          Show more purchases ({result.records.length - shown} remaining)
        </Button>
      )}
    </div>
  );
}
