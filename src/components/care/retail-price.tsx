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
      aria-label="Purchase price and retailer comparison"
      className="my-5 rounded-2xl border bg-card p-5 text-sm leading-6"
      data-retail-reference={r.id}
    >
      <h2 className="font-semibold">Purchase price & retailer comparison</h2>
      <dl className="mt-2 grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">
            {origin === "sandbox"
              ? "Verified Sandbox payment"
              : "Example purchase price"}
          </dt>
          <dd className="font-semibold">
            {amountMinor === null
              ? "Price not saved · not a $0 purchase"
              : money(amountMinor)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">
            Retailer price · saved on the date below
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
            ? "Similar product — not confirmed identical."
            : "Matching model and variant reference — not proof of ownership."}
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
          Source quote & comparison limits
        </summary>
        <blockquote>{r.quote}</blockquote>
        <p>{r.limitations}</p>
        <p>
          A lower listing doesn’t confirm a price drop or a refund. Check the
          exact product, seller’s terms, dates and condition before comparing.
        </p>
      </details>
    </section>
  );
}
