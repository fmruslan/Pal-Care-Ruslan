import type { RetailReference } from "@/lib/care/demo/contracts";
import { priceComparison } from "@/lib/care/demo/model";
import { money, displayDate } from "@/lib/demo/presentation";

export function RetailPrice({
  reference: r,
  amountMinor,
  origin,
}: {
  reference: RetailReference;
  amountMinor: number | null;
  origin: string;
}) {
  return (
    <section
      aria-label="Purchase and retail reference prices"
      className="my-5 rounded-2xl border bg-card p-5 text-sm leading-6"
      data-retail-reference={r.id}
    >
      <h2 className="font-semibold">Purchase & retail reference</h2>
      <dl className="mt-2 grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">
            {origin === "sandbox"
              ? "Verified Sandbox payment"
              : "Fictional purchase amount"}
          </dt>
          <dd className="font-semibold">
            {amountMinor === null
              ? "Unavailable · reference ownership, not a $0 purchase"
              : money(amountMinor)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">
            Retail reference price · dated snapshot
          </dt>
          <dd className="font-semibold">{money(r.priceMinor)} USD</dd>
        </div>
      </dl>
      <p className="mt-3">
        {r.brand} · {r.model} · {r.variant}
      </p>
      <p>
        <strong>
          {r.match === "comparable"
            ? "Comparable product, not verified identical."
            : "Model/variant reference, not verified ownership."}
        </strong>{" "}
        {r.matchReason}
      </p>
      <p className="text-muted-foreground">
        {r.retailer} · seller: {r.seller} · checked{" "}
        <time dateTime={r.checkedAt}>{displayDate(r.checkedAt)}</time> ·{" "}
        {r.retrieval === "direct-page"
          ? "Direct listing reviewed"
          : "Retailer search extract; direct page unavailable"}
      </p>
      <a
        className="inline-flex min-h-11 items-center text-primary underline"
        href={r.url}
        rel="noreferrer"
      >
        View retailer source
      </a>
      <p>{priceComparison(amountMinor, r)}</p>
      <details className="mt-1 text-xs text-muted-foreground">
        <summary className="inline-flex min-h-11 cursor-pointer items-center">
          Snapshot source & limits
        </summary>
        <blockquote>{r.quote}</blockquote>
        <p>{r.limitations}</p>
        <p>
          A lower listing alone never proves a price drop or adjustment
          eligibility. Exact product identity, merchant terms, timing and
          condition must still be checked.
        </p>
      </details>
    </section>
  );
}
