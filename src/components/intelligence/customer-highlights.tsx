import Link from "next/link";
import { ArrowUpRight, Sparkles } from "lucide-react";
import type { CustomerPurchase } from "@/lib/intelligence/customer-model";
import { purchaseHighlights } from "@/lib/intelligence/customer-presentation";
import { displayDate } from "@/lib/demo/presentation";
import { ProductArt } from "../product-art";
import { Badge } from "../ui/badge";

export function CustomerHighlights({
  purchases,
}: {
  purchases: CustomerPurchase[];
}) {
  const highlights = purchaseHighlights(purchases);
  return (
    <section
      className="intelligence-wash mb-5 rounded-2xl border p-4 sm:p-5"
      aria-labelledby="insights-companion-title"
    >
      <p className="flex items-center gap-2 text-sm font-semibold text-intelligence-foreground">
        <Sparkles className="size-4" aria-hidden="true" /> CareOS · From your
        saved records
      </p>
      <h2 id="insights-companion-title" className="mt-2 text-xl font-semibold">
        A clearer picture. A useful next step.
      </h2>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {highlights.map(({ id, purchase, title, label, href, kind }) => (
          <article
            key={id}
            className="flex min-w-0 flex-wrap items-start gap-3 rounded-xl border bg-card p-4"
          >
            {purchase.illustration && (
              <ProductArt kind={purchase.illustration} size="thumbnail" />
            )}
            <div className="min-w-0 flex-1 basis-40">
              <Badge
                tone={purchase.origin === "sandbox" ? "success" : "neutral"}
              >
                {purchase.origin === "sandbox"
                  ? "Verified Sandbox purchase"
                  : "Sample purchase"}
              </Badge>
              <h3 className="mt-2 text-sm font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {purchase.name} · {displayDate(purchase.purchasedOn)}
              </p>
              <Link
                href={href}
                className={`mt-2 inline-flex min-h-11 items-center gap-2 text-sm font-semibold underline-offset-4 hover:underline ${kind === "care" ? "text-care-foreground" : "text-primary"}`}
              >
                {label}
                <ArrowUpRight className="size-4" aria-hidden="true" />
              </Link>
            </div>
          </article>
        ))}
      </div>
      {!highlights.length && (
        <p className="mt-3 text-sm text-muted-foreground">
          No receipt or supported-care suggestion is available in these saved
          records.
        </p>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        Prepared from the loaded purchase window · no model call. Not live
        price, warranty or recall monitoring.
      </p>
    </section>
  );
}
