"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { documentLinkTitle } from "@/lib/document-view";
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
              ? "Example purchase value"
              : "Verified Sandbox purchase value"}
            {partial ? " · some records unavailable" : ""}
          </dt>
          <dd className="mt-1 text-xl font-semibold">
            {usd(total.amountMinor)}
          </dd>
          <dd className="mt-1 text-xs text-muted-foreground">
            {total.pricedCount} with a saved price · {total.excludedCount}{" "}
            unpriced or reference items left out
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Values/identities are computed on the server; the model cannot supply links. */
export function RecordsResultView({
  result: raw,
  requestId,
  onNavigate,
  autoApply = false,
  onAutoApplyStarted,
  presentation = "transcript",
  headingLevel = 3,
  intent,
}: {
  result: RecordsResult;
  /** Actual rendered turn identity; presentation evidence, never authority. */
  requestId: string;
  onNavigate: () => void;
  autoApply?: boolean;
  onAutoApplyStarted?: () => void;
  presentation?: "inline" | "transcript" | "panel";
  headingLevel?: 2 | 3;
  intent?: import("@/lib/careos/contracts").CareAnswer["recordsPresentation"];
}) {
  const ResultHeading = headingLevel === 2 ? "h2" : "h3";
  const [shown, setShown] = useState(presentation === "panel" ? 3 : 10);
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
      if (intent?.action === "restore" && !intent.originalRequestId)
        throw new Error("insights_original_identity_missing");
      await applyRecords(
        recordsResultSchema.parse(raw),
        AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
        requestId,
        intent?.action === "restore" ? intent.originalRequestId : undefined,
      );
      controller.signal.throwIfAborted();
      setChartStatus(
        intent?.action === "restore"
          ? "Your original Insights view is restored. Its chart, totals, filters and matching purchases were checked. No new chart was created; purchase records are unchanged."
          : "Your chart is ready in Insights. The chart, separate USD totals, filters and matching purchases were checked. Purchase records are unchanged.",
      );
      if (presentation === "inline" || presentation === "panel") {
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
        intent?.action === "restore"
          ? "North couldn’t restore and confirm the original Insights view. No new chart was created. Find the original answer in History; restoration isn’t confirmed."
          : "North couldn’t confirm the chart, or it was stopped. Any view changes already shown may remain. Nothing will retry automatically; saved purchases are unchanged.",
      );
    } finally {
      active.current = null;
      setApplying(false);
    }
  }, [applyRecords, raw, presentation, requestId, intent]);
  useEffect(() => () => active.current?.abort(), []);
  useEffect(() => {
    if (
      !autoApply ||
      intent?.action === "inspect" ||
      raw.query.format !== "chart" ||
      started.current
    )
      return;
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
    intent?.action,
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
        North couldn’t check this saved answer, so its amounts and links can’t
        be shown. No purchase details have been guessed.
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
        {r.origin === "sample" ? "Example purchase" : "Verified Sandbox"} ·{" "}
        {r.category}
      </p>
      <p className="text-sm">
        {r.amountMinor === null
          ? "No saved purchase price · unpriced or reference item"
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
                  {documentLinkTitle(d.title, r.name)}
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
      className={`space-y-4 ${presentation === "inline" ? "north-native-records" : presentation === "panel" ? "north-panel-records" : ""}`}
      data-records-result
      data-records-presentation={presentation}
      data-snapshot-id={result.snapshotId}
    >
      <details className="text-xs text-muted-foreground">
        <summary className="min-h-11 cursor-pointer py-3">
          {result.coverage.complete
            ? "All available saved purchases checked"
            : "Some saved purchases unavailable"}{" "}
          ·{" "}
          {result.coverage.source === "fixtures"
            ? "Fictional sample preview"
            : "Saved purchase records"}
        </summary>
        <p>
          {result.coverage.availableCount} validated available records ·{" "}
          {result.coverage.complete
            ? "complete available library"
            : `partial library; read limit ${result.coverage.limit}`}{" "}
          · observed {result.observedAt} ·{" "}
          {result.coverage.excludedInvalidCount} invalid records excluded. Saved
          records only, not complete PayPal account history. Observation and
          query use UTC; example purchases and Verified Sandbox remain distinct.
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
            Comparison period: {result.comparison.from} through{" "}
            {result.comparison.to}
          </ResultHeading>
          <Totals
            totals={result.comparison.totals}
            partial={!result.coverage.complete}
          />
          <p className="text-sm text-muted-foreground">
            {result.comparison.records.length} purchases in the comparison
            period. Saved amounts only—not your full account history or an
            explanation of why spending changed.
          </p>
          <details>
            <summary className="min-h-11 cursor-pointer py-3">
              View purchases from this period
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
                    {r.origin === "sample"
                      ? "Example purchase"
                      : "Verified Sandbox"}
                  </Link>
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}
      {result.query.format === "chart" && intent?.action !== "inspect" && (
        <p
          role="status"
          className="rounded-xl border p-3 text-sm text-muted-foreground"
        >
          {chartStatus ||
            "Your chart isn’t confirmed yet. Open Insights to show this saved result. If its purchases are missing or have changed, North won’t use different ones."}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {insights.connected && intent?.action !== "inspect" && (
          <Button
            variant="intelligence"
            disabled={applying}
            onClick={() => void applyChart()}
          >
            {applying
              ? "Preparing your chart…"
              : intent?.action === "restore"
                ? "Restore original view"
                : "Show chart in Insights"}
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
                      `• ${r.name} · ${r.model} — ${r.purchasedOn} — ${r.origin === "sample" ? "Example purchase" : "Verified Sandbox"} — ${r.amountMinor === null ? "Price unavailable" : usd(r.amountMinor)} — /vault/${r.id}`,
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
          {pathname === "/insights" ? "Go to your chart" : "Open Insights"}
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
          No saved purchases match these filters. Your filters are still in
          place.
        </p>
      )}
      {result.query.format === "table" && presentation !== "panel" ? (
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
                      {r.origin === "sample"
                        ? "Example purchase"
                        : "Verified Sandbox"}
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
                              {documentLinkTitle(d.title, r.name)}
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
            setShown((n) =>
              Math.min(
                n + (presentation === "panel" ? 3 : 20),
                result.records.length,
              ),
            )
          }
        >
          Show more purchases ({result.records.length - shown} remaining)
        </Button>
      )}
    </div>
  );
}
