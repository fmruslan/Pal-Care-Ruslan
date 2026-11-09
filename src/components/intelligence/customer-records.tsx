import Link from "next/link";
import type { CustomerPurchase } from "@/lib/intelligence/customer-model";
import { money, displayDate } from "@/lib/demo/presentation";
import { Badge } from "../ui/badge";
import { ProductArt } from "../product-art";
import { selectionEvidence } from "@/lib/intelligence/customer-presentation";

/** A custom Studio evidence view, never a replacement for native charts. */
export function CustomerEvidence({
  purchases,
}: {
  purchases: CustomerPurchase[];
}) {
  const facts = selectionEvidence(purchases);
  const groups = [
    { label: "Saved purchases", value: facts.purchases, x: 48 },
    { label: "Saved documents", value: facts.documents, x: 160 },
    { label: "Care products", value: facts.careProducts, x: 272 },
  ];
  return (
    <>
      <p className="text-sm leading-6 text-muted-foreground">
        The evidence behind this selection, linked to its original purchases.
      </p>
      <svg
        viewBox="0 0 320 90"
        aria-hidden="true"
        focusable="false"
        className="my-3 h-24 w-full max-w-md text-intelligence-foreground"
      >
        <path
          d="M48 44H272"
          fill="none"
          stroke="currentColor"
          strokeOpacity=".25"
          strokeWidth="2"
          strokeDasharray="4 5"
        />
        {groups.map(({ label, value, x }) => (
          <g key={label}>
            <circle
              cx={x}
              cy="44"
              r="25"
              fill="var(--card)"
              stroke="currentColor"
              strokeOpacity=".4"
            />
            <text
              x={x}
              y="50"
              textAnchor="middle"
              fill="currentColor"
              fontSize="18"
              fontWeight="600"
            >
              {value}
            </text>
          </g>
        ))}
      </svg>
      <dl
        className="grid grid-cols-3 gap-3 text-sm"
        data-testid="selection-evidence-counts"
      >
        {groups.map(({ label, value }) => (
          <div key={label}>
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="mt-1 text-lg font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs leading-5 text-muted-foreground">
        {facts.verified} Verified Sandbox · {facts.purchases - facts.verified}{" "}
        Sample. Care products count distinct linked guidance pages, not warranty
        coverage.
        {facts.careUnavailable
          ? " Some care evidence is unavailable; counts are partial."
          : ""}
      </p>
      <ul className="mt-2 flex flex-wrap gap-x-4 text-sm">
        {purchases.slice(0, 2).map((purchase) => (
          <li key={purchase.id}>
            <Link
              href={purchase.href}
              className="inline-flex min-h-11 items-center text-primary underline underline-offset-4"
            >
              {purchase.name} · {displayDate(purchase.purchasedOn)}
            </Link>
          </li>
        ))}
      </ul>
      <details className="mt-3 border-t text-sm">
        <summary className="min-h-11 cursor-pointer py-3 font-semibold">
          View all selected records · {facts.purchases}
        </summary>
        <CustomerRecords purchases={purchases} />
      </details>
    </>
  );
}

export function CustomerRecords({
  purchases,
  compact = false,
}: {
  purchases: CustomerPurchase[];
  compact?: boolean;
}) {
  return (
    <div className="space-y-3" data-testid="insight-source-records">
      {!purchases.length && (
        <p className="py-4 text-sm text-muted-foreground">
          No saved purchases match this view. Clear the filters to explore your
          available records.
        </p>
      )}
      {purchases.map((p) => (
        <article
          key={p.id}
          className="min-w-0 rounded-xl border bg-card p-4"
          data-purchase-id={p.id}
        >
          <div className="flex flex-wrap items-start gap-3">
            {!compact && p.illustration && (
              <ProductArt kind={p.illustration} size="thumbnail" />
            )}
            <div className="min-w-0 flex-1 basis-44">
              <Link
                href={p.href}
                className="inline-flex min-h-11 items-center text-base font-semibold text-foreground underline-offset-4 hover:text-primary hover:underline"
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
            <Badge tone={p.origin === "sandbox" ? "success" : "neutral"}>
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
