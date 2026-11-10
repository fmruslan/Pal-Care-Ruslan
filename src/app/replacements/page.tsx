import Link from "next/link";
import { getDemoData } from "@/lib/demo/repository";
import { getAlternatives } from "@/lib/discovery/runtime";
import { money } from "@/lib/demo/presentation";
import { Shell } from "@/components/shell";
import { PageHeading } from "@/components/page-heading";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Recycle, ShieldCheck, ShoppingBag } from "lucide-react";
import { notFound } from "next/navigation";
import { journeyContext, type JourneyQuery } from "@/lib/careos/journey";
import { recordIdSchema } from "@/lib/demo/presentation";
import { CareContextRegistration } from "@/components/careos/provider";
export const metadata = { title: "Replacement options" };
export default async function ReplacementsPage({
  searchParams,
}: {
  searchParams: Promise<JourneyQuery>;
}) {
  const query = await searchParams;
  if (query.twinId && !recordIdSchema.safeParse(query.twinId).success)
    notFound();
  const data = await getDemoData(query.twinId);
  const journey = journeyContext(data, query);
  if (!journey) notFound();
  const { category } = journey;
  if (!category)
    return (
      <Shell active="/vault" source={data.source}>
        <CareContextRegistration context={journey.context} />
        <PageHeading
          eyebrow="Pal Care · Replacement options"
          title="No replacement options for this product"
          description={`${journey.context?.name} · ${journey.context?.model}. No matching category is available, so unrelated products aren’t shown.`}
        />
        <Card>
          <Link
            className="inline-flex min-h-11 items-center text-primary"
            href={journey.back}
          >
            Back to product →
          </Link>
        </Card>
      </Shell>
    );
  const discovery = await getAlternatives(category);
  return (
    <Shell active="/vault" source={data.source}>
      <CareContextRegistration context={journey.context} />
      {journey.context && (
        <p className="mb-5 text-sm" role="note">
          For {journey.context.name} · {journey.context.model}.{" "}
          {journey.context.example
            ? "Fictional ownership example · no purchase or receipt."
            : "Similar products, not a confirmed fit for this model."}{" "}
          <Link
            className="inline-flex min-h-11 items-center font-semibold text-primary"
            href={journey.back}
          >
            Back to product →
          </Link>
        </p>
      )}
      <PageHeading
        eyebrow="Pal Care · Replacement options"
        title="Consider care before replacing"
        description="Keep what works. Check care and remedy options first. Explore replacements only when they make sense."
      />
      <div className="mb-6 grid gap-4 md:grid-cols-3">
        {[
          [
            Recycle,
            "Care before replacement",
            "Check guidance from a trusted source for your exact model. Don’t use another model’s repair instructions.",
          ],
          [
            ShieldCheck,
            "Safety before shopping",
            "If your item matches a recall, follow the official remedy and stop-use guidance first. Buying another item does not resolve a recall.",
          ],
          [
            ShoppingBag,
            "Compare, don’t assume",
            "Check the exact version, total price, retailer terms and current availability. Pal Care does not buy from other retailers for you.",
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
            ? "Fictional examples · no live offers"
            : "Offers from Channel3 · just checked"}
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
      {journey.context && (
        <p className="mb-4 text-xs text-muted-foreground">
          Choosing another category shows options for that category, rather than
          this specific product.
        </p>
      )}
      {discovery.mode === "fixture" && (
        <p className="mb-6 max-w-3xl text-sm leading-7 text-muted-foreground">
          These fictional examples show how comparisons could look. They are not
          live Channel3 offers or buying recommendations. Prices and
          availability have not been checked, and there are no purchase links.
        </p>
      )}
      <div className="grid items-start gap-5 md:grid-cols-3">
        {discovery.alternatives.map((item, i) => (
          <Card key={`${item.id}-${i}`}>
            <p className="text-xs font-semibold tracking-widest text-intelligence-foreground uppercase">
              {item.provenance === "illustrative"
                ? "Fictional comparison"
                : "Retail offer"}
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
                <dt className="text-muted-foreground">Last checked</dt>
                <dd className="mt-1 break-words">
                  {item.checkedAt ?? "Not checked"}
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
            No outdated offer or fictional product has been substituted. Offers
            appear only when their link, currency, condition, price and current
            availability meet the comparison requirements.
          </p>
        </Card>
      )}
      <p className="mt-6 text-xs leading-6 text-muted-foreground">
        These options do not confirm recall status or compatibility. Retailer
        links may include Channel3 attribution; ranking is not based on
        commission. When live offers are available, their prices are checked
        again rather than copied from an old comparison.
      </p>
      <div className="mt-4 flex flex-wrap gap-5">
        <Link
          href="/vault"
          className="inline-flex min-h-11 items-center text-sm font-semibold text-primary"
        >
          View your purchases →
        </Link>
        <Link
          href={journey.context ? `/safety?${journey.query}` : "/safety"}
          className="inline-flex min-h-11 items-center text-sm font-semibold text-primary"
        >
          View official recall information →
        </Link>
      </div>
    </Shell>
  );
}
