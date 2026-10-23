import Link from "next/link";
import {
  ArrowUpRight,
  ChartNoAxesCombined,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { getDemoData } from "@/lib/demo/repository";
import { money } from "@/lib/demo/presentation";
import { Shell } from "@/components/shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeading } from "@/components/page-heading";
import { Events } from "@/components/events";
import { REFERENCE_PRODUCT } from "@/lib/careos/knowledge";

export const metadata = { title: "Merchant workspace" };
export default async function Merchant() {
  const data = await getDemoData();
  const docTypes = [
    { kind: "receipt", label: "Receipts" },
    { kind: "care-card", label: "Care cards" },
    { kind: "policy", label: "Policies" },
  ].map((type) => ({
    ...type,
    count: data.documents.filter((doc) => doc.kind === type.kind).length,
  }));
  return (
    <Shell active="/merchant" source={data.source} merchant>
      <PageHeading
        eyebrow="Better care, beyond checkout"
        title={data.merchant.name}
        description="A clear view of product ownership. Public, read-only demo inventory and source-labeled care history."
        action={
          <Badge tone="blue">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            Fictional merchant
          </Badge>
        }
      />
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        {[
          [data.products.length, "Sample catalog items"],
          [
            data.twins.filter((t) => t.origin === "sample").length,
            "Sample Purchase Twins",
          ],
          [
            data.twins.filter((t) => t.origin === "sandbox").length,
            "Verified sandbox transactions",
          ],
        ].map(([value, label]) => (
          <Card key={label} className="rounded-2xl py-5">
            <p className="text-3xl font-semibold tabular-nums text-primary">
              {value}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">{label}</p>
          </Card>
        ))}
      </div>
      <section aria-labelledby="inventory-heading">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 id="inventory-heading" className="section-title">
            Sample inventory
          </h2>
          <span className="text-sm text-muted-foreground">
            Trusted demo catalog · No public editing
          </span>
        </div>
        <Card className="overflow-hidden p-0">
          <table className="w-full table-fixed text-left text-sm">
            <caption className="sr-only">
              Fictional merchant catalog. Prices are sample data, not live
              merchant prices.
            </caption>
            <thead className="border-b bg-secondary text-secondary-foreground">
              <tr>
                <th
                  scope="col"
                  className="w-[40%] px-4 py-4 font-medium sm:w-[35%] sm:px-6"
                >
                  Product / model
                </th>
                <th
                  scope="col"
                  className="hidden px-4 py-4 font-medium sm:table-cell"
                >
                  Category
                </th>
                <th
                  scope="col"
                  className="w-[26%] px-3 py-4 font-medium sm:w-[20%]"
                >
                  Sample price
                </th>
                <th
                  scope="col"
                  className="w-[34%] px-3 py-4 font-medium sm:w-[25%]"
                >
                  Purchase Twin
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.products.map((product) => (
                <tr key={product.id}>
                  <td className="break-words px-4 py-5 sm:px-6">
                    <p className="font-semibold">{product.name}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {product.brand} · {product.model}
                    </p>
                  </td>
                  <td className="hidden px-4 py-5 text-muted-foreground sm:table-cell">
                    {product.category}
                  </td>
                  <td className="px-3 py-5 font-medium tabular-nums">
                    {product.id === REFERENCE_PRODUCT
                      ? "Not for sale · reference"
                      : money(product.priceMinor)}
                  </td>
                  <td className="px-3 py-4">
                    {data.twins
                      .filter((t) => t.productId === product.id)
                      .map((twin) => (
                        <Link
                          key={twin.id}
                          href={`/vault/${twin.id}`}
                          className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-primary"
                        >
                          {twin.origin === "sandbox"
                            ? "View sandbox purchase"
                            : "View sample"}
                          <ArrowUpRight
                            className="size-4 shrink-0"
                            aria-hidden="true"
                          />
                        </Link>
                      ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>
      <div className="mt-8 grid items-start gap-7 xl:grid-cols-[1.3fr_1fr]">
        <section aria-labelledby="events-heading">
          <h2 id="events-heading" className="section-title mb-5">
            CareOS event examples
          </h2>
          <Events events={data.events} />
        </section>
        <div className="space-y-5">
          <Card>
            <h2 className="text-base font-semibold">Documents, connected</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Counts from the available demo records.
            </p>
            <ul className="mt-6 space-y-5">
              {docTypes.map((type) => (
                <li key={type.kind}>
                  <div className="mb-2 flex justify-between gap-3 text-sm">
                    <span>{type.label}</span>
                    <span className="font-semibold tabular-nums">
                      {type.count}
                    </span>
                  </div>
                  <div
                    aria-hidden="true"
                    className="h-2 overflow-hidden rounded-full bg-neutral"
                  >
                    <div
                      className={`h-full rounded-full ${type.kind === "care-card" ? "bg-intelligence-foreground" : "bg-primary"}`}
                      style={{
                        width: `${data.documents.length ? (type.count / data.documents.length) * 100 : 0}%`,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </Card>
          <section
            className="intelligence-wash rounded-3xl border p-6"
            aria-labelledby="intelligence-heading"
          >
            <div className="flex items-center justify-between gap-3">
              <ChartNoAxesCombined
                className="size-6 text-intelligence-foreground"
                aria-hidden="true"
              />
              <Badge tone="intelligence">
                <Sparkles className="size-3.5" aria-hidden="true" />
                Planned
              </Badge>
            </div>
            <h2
              id="intelligence-heading"
              className="mt-5 text-xl font-semibold"
            >
              Merchant intelligence
            </h2>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              A clearer picture of aftercare. AG Studio dashboards and
              natural-language analytics are planned. This is not an active
              sponsor integration.
            </p>
          </section>
          <p className="flex gap-2 px-1 text-sm leading-7 text-muted-foreground">
            <ShieldCheck className="mt-1 size-4 shrink-0" aria-hidden="true" />
            No catalog editing, merchant approvals, refunds or paid AI calls are
            exposed here.
          </p>
        </div>
      </div>
    </Shell>
  );
}
