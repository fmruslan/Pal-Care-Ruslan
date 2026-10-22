import Link from "next/link";
import { ArrowUpRight, ChartNoAxesCombined, ShieldCheck } from "lucide-react";
import { getDemoData } from "@/lib/demo/repository";
import { money } from "@/lib/demo/presentation";
import { Shell } from "@/components/shell";
import { Card } from "@/components/ui/card";
import { Events } from "@/components/events";

export const metadata = { title: "Merchant workspace" };

export default async function Merchant() {
  const data = await getDemoData();
  return (
    <Shell active="/merchant" source={data.source} merchant>
      <p className="text-xs font-semibold uppercase tracking-[.18em] text-muted-foreground">
        BETTER CARE. BEYOND CHECKOUT.
      </p>
      <h1 className="mt-3 font-display text-4xl sm:text-5xl">
        {data.merchant.name}
      </h1>
      <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground">
        Your merchant workspace. A public, read-only view of fictional inventory
        and care events.
      </p>
      <div className="my-7 grid gap-4 sm:grid-cols-3">
        {[
          [data.products.length, "Sample catalog items"],
          [data.twins.length, "Sample Purchase Twins"],
          [0, "Verified sandbox transactions"],
        ].map(([value, label]) => (
          <Card key={label}>
            <p className="text-3xl font-semibold">{value}</p>
            <p className="mt-2 text-xs text-muted-foreground">{label}</p>
          </Card>
        ))}
      </div>
      <section aria-labelledby="inventory-heading">
        <h2 id="inventory-heading" className="mb-5 font-display text-2xl">
          Sample inventory
        </h2>
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[560px] text-left text-sm">
            <caption className="sr-only">
              Fictional merchant catalog. Prices are sample data, not live
              merchant prices.
            </caption>
            <thead className="border-b bg-secondary text-xs text-muted-foreground">
              <tr>
                {[
                  "Product / model",
                  "Category",
                  "Sample catalog price",
                  "Purchase Twin",
                ].map((heading) => (
                  <th
                    key={heading}
                    scope="col"
                    className="px-5 py-4 font-medium"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.products.map((product) => (
                <tr key={product.id}>
                  <td className="px-5 py-5">
                    <p className="font-semibold">{product.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {product.brand} · {product.model}
                    </p>
                  </td>
                  <td className="px-5 py-5 text-muted-foreground">
                    {product.category}
                  </td>
                  <td className="px-5 py-5">{money(product.priceMinor)}</td>
                  <td className="px-5 py-5">
                    {data.twins
                      .filter((twin) => twin.productId === product.id)
                      .map((twin) => (
                        <Link
                          key={twin.id}
                          href={`/vault/${twin.id}`}
                          className="inline-flex min-h-11 items-center gap-2 text-xs font-semibold"
                        >
                          View sample
                          <ArrowUpRight className="size-4" aria-hidden="true" />
                        </Link>
                      ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>
      <div className="mt-8 grid gap-7 xl:grid-cols-2">
        <section aria-labelledby="events-heading">
          <h2 id="events-heading" className="mb-5 font-display text-2xl">
            CareOS event examples
          </h2>
          <Events events={data.events} />
        </section>
        <section aria-labelledby="intelligence-heading">
          <h2 id="intelligence-heading" className="mb-5 font-display text-2xl">
            Merchant intelligence
          </h2>
          <Card className="border-dashed bg-secondary/50 py-10 text-center">
            <ChartNoAxesCombined
              className="mx-auto size-9"
              aria-hidden="true"
            />
            <h3 className="mt-5 text-base font-semibold">
              A clearer picture of aftercare.
            </h3>
            <p className="mx-auto mt-3 max-w-sm text-sm leading-7 text-muted-foreground">
              AG Studio dashboards and natural-language analytics are planned.
              This placeholder is not a sponsor integration.
            </p>
            <span className="mt-5 inline-block rounded-full border bg-card px-3 py-2 text-xs">
              Not connected · future stage
            </span>
          </Card>
          <Card className="mt-5">
            <ShieldCheck className="mb-4 size-6" aria-hidden="true" />
            <h3 className="text-sm font-semibold">
              View freely. Act carefully.
            </h3>
            <p className="mt-3 text-xs leading-6 text-muted-foreground">
              No catalog editing, approvals, refunds or paid API calls are
              exposed. Future consequential operations require server-side
              operator authorization and abuse controls.
            </p>
          </Card>
        </section>
      </div>
    </Shell>
  );
}
