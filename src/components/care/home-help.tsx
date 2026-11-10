import {
  ArrowRight,
  ChartNoAxesCombined,
  FileText,
  ShieldCheck,
  Tag,
  TriangleAlert,
  BookOpen,
} from "lucide-react";
import { WorkspaceNavigationLink as Link } from "../intelligence/workspace-navigation-link";
import { ProductArt } from "../product-art";
import type { CareFeed } from "@/lib/care/model";
import { careProductCards } from "@/lib/care/summary";
import { ownershipHref } from "@/lib/care/ownership-contracts";

const chip =
  "inline-flex min-h-11 max-w-full cursor-pointer items-center gap-2 rounded-full border bg-card px-4 py-2 text-sm font-medium shadow-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
const action =
  "inline-flex min-h-11 min-w-0 max-w-full items-center gap-2 rounded-lg text-sm font-semibold text-intelligence-foreground [overflow-wrap:anywhere] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** Choices refer only to the loaded, owned records. These links never dispatch a model or payment. */
export function CareHelpShortcuts({ feed }: { feed: CareFeed }) {
  const cards = careProductCards(feed);
  return (
    <nav
      aria-label="Find help for your purchases"
      className="relative mb-7 flex min-w-0 flex-wrap gap-2"
    >
      <Link className={chip} href="/documents?documentCategory=receipts">
        <FileText
          className="size-4 shrink-0 text-intelligence-foreground"
          aria-hidden="true"
        />
        Find a receipt
      </Link>
      <details name="care-help" className="group">
        <summary
          className={`${chip} list-none [&::-webkit-details-marker]:hidden`}
        >
          <ShieldCheck
            className="size-4 shrink-0 text-intelligence-foreground"
            aria-hidden="true"
          />
          Returns &amp; warranties
        </summary>
        <div className="absolute inset-x-0 z-20 mt-2 rounded-2xl border bg-card p-4 shadow-card">
          <p className="text-sm text-muted-foreground">
            Choose the saved information you need, then filter by purchase and
            date.
          </p>
          <div className="mt-2 flex flex-wrap gap-x-6">
            <Link className={action} href="/documents?documentCategory=returns">
              Return terms &amp; policies{" "}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <Link
              className={action}
              href="/documents?documentCategory=warranties"
            >
              Warranties &amp; coverage{" "}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </details>
      {(
        [
          ["price", "Prices & refunds", Tag],
          ["safety", "Product safety", TriangleAlert],
        ] as const
      ).map(([topic, label, Icon]) => {
        const choices = cards.flatMap((card) => {
          const facts =
            card.view?.facts.filter(
              (f) =>
                (topic === "price"
                  ? ["price", "refunds"].includes(f.topic)
                  : f.topic === "safety") &&
                !["unknown", "unavailable", "not-applicable"].includes(f.state),
            ) ?? [];
          return facts.map((fact) => ({ card, fact }));
        });
        return (
          <details key={topic} name="care-help" className="group">
            <summary
              className={`${chip} list-none [&::-webkit-details-marker]:hidden`}
            >
              <Icon
                className={`size-4 shrink-0 ${topic === "safety" ? "text-warning" : "text-intelligence-foreground"}`}
                aria-hidden="true"
              />
              {label}
            </summary>
            <div className="absolute inset-x-0 z-20 mt-2 rounded-2xl border bg-card p-4 shadow-card">
              <p className="text-sm font-medium">
                {topic === "safety"
                  ? "Choose a product to check its saved notice and official source."
                  : "Choose a purchase to review its saved comparison or refund details."}
              </p>
              {choices.length ? (
                <ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {choices.map(({ card, fact }) => (
                    <li
                      key={`${card.item.purchase.id}:${fact.id}`}
                      className="min-w-0"
                    >
                      <Link
                        className={`${action} w-full justify-between rounded-xl bg-muted/40 px-3 py-2`}
                        href={ownershipHref(card.item.purchase.id, fact.topic)}
                      >
                        <span className="min-w-0">
                          {card.item.purchase.name}
                          <span className="mt-1 block text-xs font-normal text-muted-foreground">
                            {fact.consumer?.status ?? fact.status}
                          </span>
                        </span>
                        <ArrowRight
                          className="size-4 shrink-0"
                          aria-hidden="true"
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">
                  No applicable{" "}
                  {topic === "safety"
                    ? "safety evidence"
                    : "comparison or refund evidence"}{" "}
                  is saved. Missing information is not an all-clear.
                </p>
              )}
              {topic === "price" && (
                <Link className={`${action} mt-2`} href="/guardian">
                  Recorded price adjustments{" "}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              )}
            </div>
          </details>
        );
      })}
      <Link className={chip} href="/documents?documentCategory=care">
        <BookOpen
          className="size-4 shrink-0 text-intelligence-foreground"
          aria-hidden="true"
        />
        Care guides
      </Link>
    </nav>
  );
}

export function CareAttention({ feed }: { feed: CareFeed }) {
  const cards = careProductCards(feed, "attention");
  if (!cards.length) return null;
  return (
    <section
      aria-labelledby="care-attention-title"
      className="mb-7 border-t pt-5"
      data-care-attention
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2
          id="care-attention-title"
          className="text-xl font-semibold tracking-tight sm:text-2xl"
        >
          Needs your attention
        </h2>
        <span className="text-xs text-muted-foreground">
          {cards.length} {cards.length === 1 ? "item" : "items"}
        </span>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {cards.map((card) => {
          const p = card.item.purchase,
            fact = card.view?.facts.find(
              (f) => f.topic === card.view?.pill.topic,
            );
          return (
            <article
              key={p.id}
              data-care-attention-product={p.id}
              className="flex min-w-0 flex-wrap items-start gap-4 rounded-2xl border bg-card p-4 shadow-sm [overflow-wrap:anywhere] sm:p-5"
            >
              <div className="shrink-0 rounded-xl bg-muted/40 [&>div]:size-16 [&_svg]:h-16 [&_svg]:w-18">
                <ProductArt
                  kind={p.illustration ?? "computer"}
                  size="thumbnail"
                />
              </div>
              <div className="min-w-0 flex-1 basis-48">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <h3 className="font-semibold">{p.name}</h3>
                  <span
                    className={`rounded-lg px-2 py-1 text-xs font-medium ${fact?.topic === "safety" ? "bg-secondary text-secondary-foreground" : "bg-intelligence text-intelligence-foreground"}`}
                  >
                    {fact?.consumer?.status ??
                      card.view?.pill.label ??
                      card.item.status}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-6">
                  {fact?.consumer?.summary ?? fact?.summary ?? card.item.detail}
                </p>
                <Link
                  className={action}
                  href={
                    fact
                      ? ownershipHref(p.id, fact.topic)
                      : card.item.action.href
                  }
                >
                  {fact?.consumer?.action ?? card.item.action.label}
                  <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
                </Link>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function HowPalCareWorks({ feed }: { feed: CareFeed }) {
  const verifiedReceipt = feed.purchases.find(
    (p) => p.origin === "sandbox" && p.receiptHref,
  )?.receiptHref;
  return (
    <section
      aria-labelledby="care-journey-title"
      className="relative mt-7 rounded-2xl border border-intelligence-border bg-intelligence/50 p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 sm:pr-44">
        <div className="flex min-w-0 items-start gap-4">
          <ChartNoAxesCombined
            className="mt-1 size-9 shrink-0 text-intelligence-foreground"
            aria-hidden="true"
          />
          <div className="min-w-0">
            <h2
              id="care-journey-title"
              className="text-xl font-semibold tracking-tight sm:text-2xl"
            >
              How Pal Care works
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              PayPal purchase → saved record → Care and North → AG Studio
              Insights.
            </p>
          </div>
        </div>
      </div>
      <details
        id="care-journey-explanation"
        className="mt-3 scroll-mt-6 text-sm"
      >
        <summary
          className={`${action} cursor-pointer list-none rounded-full border border-intelligence-border bg-card px-5 sm:absolute sm:top-6 sm:right-6 [&::-webkit-details-marker]:hidden`}
        >
          Learn more <ArrowRight className="size-4" aria-hidden="true" />
        </summary>
        <p className="mt-2 max-w-3xl leading-7">
          A verified PayPal Sandbox payment has its own saved purchase and
          receipt. Care connects that record with its documents and useful next
          steps. Ask North about a selected purchase, then explore the same
          saved evidence with native AG Studio charts and tables. Example
          purchases stay distinct; Sandbox uses no real money.
        </p>
        <nav
          aria-label="Explore Pal Care"
          className="mt-3 flex flex-wrap gap-x-6 gap-y-1"
        >
          {verifiedReceipt && (
            <Link className={action} href={verifiedReceipt}>
              Verified Sandbox receipt{" "}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          )}
          <Link className={action} href="#library-search">
            Ask North ☆
          </Link>
          <Link className={action} href="/insights">
            AG Studio Insights
          </Link>
          <Link className={action} href="/shop">
            Explore the PayPal Sandbox shop
          </Link>
          <Link className={action} href="/about">
            About Pal Care
          </Link>
        </nav>
        <p className="mt-3 text-xs text-muted-foreground">
          Optional exploration:{" "}
          <Link
            className="inline-flex min-h-11 items-center underline"
            href="/replacements"
          >
            replacement examples
          </Link>
          . These are not current offers.
        </p>
      </details>
    </section>
  );
}
