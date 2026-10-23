import Link from "next/link";
import { getDemoData } from "@/lib/demo/repository";
import { getAlternatives } from "@/lib/discovery/runtime";
import { categorySchema } from "@/lib/discovery/contracts";
import { money } from "@/lib/demo/presentation";
import { Shell } from "@/components/shell";
import { PageHeading } from "@/components/page-heading";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Recycle, ShieldCheck, ShoppingBag } from "lucide-react";
export const metadata = { title: "Replacement Concierge" };
export default async function ReplacementsPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const [data, query] = await Promise.all([getDemoData(), searchParams]);
  const parsed = categorySchema.safeParse(query.category ?? "headphones"),
    category = parsed.success ? parsed.data : "headphones";
  const discovery = await getAlternatives(category);
  return (
    <Shell active="/vault" source={data.source}>
      <PageHeading
        eyebrow="CareOS · Replacement Concierge"
        title="The next choice, thoughtfully."
        description="Keep what works. Check care and remedy options first. Explore replacements only when they make sense."
      />
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        {[
          [
            Recycle,
            "Care before replacement",
            "Use only exact-model, source-backed care guidance. A different model’s repair steps are not a substitute.",
          ],
          [
            ShieldCheck,
            "Safety before shopping",
            "If your item matches a recall, follow the official remedy and stop-use guidance first. Buying another item does not resolve a recall.",
          ],
          [
            ShoppingBag,
            "Compare, don’t assume",
            "Check variant, total price, retailer terms and current availability. Pal Care does not perform external checkout.",
          ],
        ].map(([Icon, title, detail]) => {
          const I = Icon as typeof Recycle;
          return (
            <Card key={String(title)}>
              <I
                aria-hidden="true"
                className="size-5 text-intelligence-foreground"
              />
              <h2 className="mt-3 text-lg font-semibold">{String(title)}</h2>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                {String(detail)}
              </p>
            </Card>
          );
        })}
      </div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <Badge tone={discovery.mode === "fixture" ? "warning" : "blue"}>
          {discovery.mode === "fixture"
            ? "Illustrative profiles · Channel3 not connected"
            : "Channel3 returned offers · freshly retrieved"}
        </Badge>
        <nav aria-label="Replacement category" className="flex gap-4">
          <Link
            href="/replacements?category=headphones"
            aria-current={category === "headphones" ? "page" : undefined}
            className="inline-flex min-h-11 items-center text-sm font-semibold text-primary"
          >
            Headphones
          </Link>
          <Link
            href="/replacements?category=air-fryer"
            aria-current={category === "air-fryer" ? "page" : undefined}
            className="inline-flex min-h-11 items-center text-sm font-semibold text-primary"
          >
            Air fryers
          </Link>
        </nav>
      </div>
      {discovery.mode === "fixture" && (
        <p className="mb-6 max-w-3xl text-sm leading-7 text-muted-foreground">
          These are fictional comparison profiles, not returned Channel3
          products, current prices, availability or buying recommendations. The
          server-side API adapter is implemented; actual provider verification
          requires separate credentials and confirmed free credits.
        </p>
      )}
      <div className="grid items-start gap-5 md:grid-cols-3">
        {discovery.alternatives.map((item, i) => (
          <Card key={`${item.id}-${i}`}>
            <p className="text-xs font-semibold tracking-widest text-intelligence-foreground uppercase">
              {item.provenance === "illustrative"
                ? "Comparison profile"
                : "Provider result"}
            </p>
            <h2 className="mt-3 text-xl font-semibold">{item.title}</h2>
            <p className="mt-2 text-xs text-muted-foreground">{item.brand}</p>
            <p className="mt-5 text-2xl font-semibold">
              {item.amountMinor === null
                ? "Price not checked"
                : money(item.amountMinor)}
            </p>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              {item.reason}
            </p>
            <dl className="mt-4 space-y-3 text-xs">
              <div>
                <dt className="text-muted-foreground">Availability</dt>
                <dd className="mt-1">{item.availability}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Condition</dt>
                <dd className="mt-1">{item.condition}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Retrieved</dt>
                <dd className="mt-1 break-words">
                  {item.checkedAt ?? "No provider request"}
                </dd>
              </div>
            </dl>
            {item.href && (
              <a
                href={item.href}
                target="_blank"
                rel="noopener noreferrer sponsored"
                className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-primary"
              >
                View at {item.retailer} ↗
              </a>
            )}
          </Card>
        ))}
      </div>
      {!discovery.alternatives.length && (
        <Card>
          <h2 className="section-title">No qualifying offers available.</h2>
          <p className="mt-3 text-sm leading-7 text-muted-foreground">
            No stale or illustrative product was substituted. An offer may lack
            a safe link, supported currency, explicit condition, acceptable
            price or current provider availability.
          </p>
        </Card>
      )}
      <p className="mt-6 text-xs leading-6 text-muted-foreground">
        No complete recall screening or compatibility certification is implied.
        Live retailer links may be attributed by Channel3; ranking is not based
        on commission. Real discovery uses saved provider IDs and fresh offer
        retrieval, not stale cached prices.
      </p>
      <div className="mt-4 flex flex-wrap gap-5">
        <Link
          href="/vault"
          className="inline-flex min-h-11 items-center text-sm font-semibold text-primary"
        >
          Review your Purchase Twins →
        </Link>
        <Link
          href="/safety"
          className="inline-flex min-h-11 items-center text-sm font-semibold text-primary"
        >
          Review official safety evidence →
        </Link>
      </div>
    </Shell>
  );
}
