import Link from "next/link";
import type { CustomerPurchase } from "@/lib/intelligence/customer-model";
import { money, displayDate } from "@/lib/demo/presentation";
import { Badge } from "../ui/badge";

export function CustomerRecords({
  purchases,
  compact = false,
}: {
  purchases: CustomerPurchase[];
  compact?: boolean;
}) {
  return (
    <div className="space-y-4" data-testid="insight-source-records">
      {!purchases.length && (
        <p className="py-4 text-sm text-muted-foreground">
          No saved purchases match this view. Clear the filters to explore your
          available records.
        </p>
      )}
      {purchases.map((p) => (
        <article
          key={p.id}
          className="rounded-xl border p-4"
          data-purchase-id={p.id}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <Link
                href={p.href}
                className="inline-flex min-h-11 items-center text-base font-semibold text-primary underline-offset-4 hover:underline"
              >
                {p.name}
              </Link>
              <p className="text-sm text-muted-foreground">
                {displayDate(p.purchasedOn)} · {p.category} ·{" "}
                {p.amountMinor === null
                  ? "Purchase amount not recorded"
                  : money(p.amountMinor)}
              </p>
            </div>
            <Badge tone={p.origin === "sandbox" ? "blue" : "neutral"}>
              {p.origin === "sandbox"
                ? "Verified Sandbox purchase"
                : "Sample purchase"}
            </Badge>
          </div>
          {(!compact || p.careStatus === "unavailable") && (
            <p className="mt-2 text-sm text-muted-foreground">
              {!compact && (
                <>
                  {p.documentCount} saved{" "}
                  {p.documentCount === 1 ? "document" : "documents"} ·{" "}
                </>
              )}
              {p.careStatus === "unavailable"
                ? "Product-care evidence is unavailable or requires review; guidance availability is not established"
                : p.careStatus === "available"
                  ? "Exact-model care guidance available"
                  : "No supported manufacturer guidance recorded"}
              .
            </p>
          )}
          {p.attentionStatus === "unavailable" && (
            <p className="mt-2 text-sm text-muted-foreground">
              Aftercare evidence is incomplete. Any saved items below are
              partial; no conclusion that nothing needs attention is
              established. Saved purchase and document records remain available.
            </p>
          )}
          {!!p.attention.length && (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
              {p.attention.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          )}
          <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm font-medium text-primary">
            <Link className="inline-flex min-h-11 items-center" href={p.href}>
              Open Purchase Twin →
            </Link>
            {p.receiptHref && (
              <Link
                className="inline-flex min-h-11 items-center"
                href={p.receiptHref}
              >
                Open receipt →
              </Link>
            )}
            {p.careHref && (
              <Link
                className="inline-flex min-h-11 items-center"
                href={p.careHref}
              >
                Supported care →
              </Link>
            )}
          </div>
          {!compact && !!p.documentLinks.length && (
            <details className="mt-1 text-sm">
              <summary className="min-h-11 cursor-pointer py-3 font-medium">
                Saved documents & provenance
              </summary>
              <ul>
                {p.documentLinks.map((d) => (
                  <li key={d.href}>
                    <Link
                      href={d.href}
                      className="inline-flex min-h-11 items-center text-primary underline"
                    >
                      {d.title}
                    </Link>
                    <span className="ml-2 text-muted-foreground">
                      {d.origin === "sandbox"
                        ? "Sandbox receipt"
                        : "Sample document"}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </article>
      ))}
    </div>
  );
}
