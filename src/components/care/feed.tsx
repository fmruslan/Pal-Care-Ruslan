import { ArrowRight, Info } from "lucide-react";
import { WorkspaceNavigationLink as Link } from "../intelligence/workspace-navigation-link";
import { ProductArt } from "../product-art";
import { Button } from "../ui/button";
import { displayDate } from "@/lib/demo/presentation";
import type { CareFeed } from "@/lib/care/model";
import { careItemTopic, careProductCards } from "@/lib/care/summary";
import { AskCareOS } from "../careos/provider";
import {
  OwnershipScope,
  OwnershipPill,
  OwnershipSummary,
  CareCollectionRefresh,
  OwnershipIcon,
} from "./ownership";

function CareCard({
  item,
  findings,
  view,
}: ReturnType<typeof careProductCards>[number]) {
  const p = item.purchase;
  return (
    <OwnershipScope view={view} surface="care">
      <article
        className="care-action-card grid min-w-0 grid-cols-[2.5rem_minmax(0,1fr)] items-start gap-x-3 gap-y-1 rounded-2xl border bg-card p-3 shadow-sm [overflow-wrap:anywhere] sm:grid-cols-[3rem_minmax(0,1fr)_auto] sm:gap-x-4 sm:px-4"
        data-care-card={item.id}
        data-care-product={p.id}
      >
        <div className="care-product-art min-w-0 sm:row-span-3 sm:self-center">
          <ProductArt kind={p.illustration ?? "computer"} size="thumbnail" />
        </div>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,45%)] items-start gap-x-2 gap-y-1 sm:col-span-2 sm:flex sm:flex-wrap sm:justify-between sm:gap-x-3">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold tracking-tight">
              <Link
                href={p.href}
                className="hover:text-primary hover:underline"
              >
                {p.name}
              </Link>
            </h3>
            <p className="text-xs leading-5 text-muted-foreground">
              {p.model} ·{" "}
              {p.origin === "sandbox" ? "Sandbox purchase" : "Sample purchase"}{" "}
              <span className="hidden sm:inline">
                {" "}
                ·{" "}
                <time dateTime={p.purchasedOn}>
                  {displayDate(p.purchasedOn)}
                </time>
              </span>
            </p>
          </div>
          <div className="col-start-2 row-start-1 min-w-0 justify-self-end sm:order-last">
            <OwnershipPill compact />
          </div>
          <details className="col-start-1 row-start-2 min-w-0 text-xs text-muted-foreground">
            <summary className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
              <Info className="size-3.5" aria-hidden="true" />
              Evidence & source
            </summary>
            {findings.map((finding) => (
              <div key={finding.id} className="mb-3 max-w-xl">
                <p className="font-semibold leading-5">{finding.status}</p>
                <p className="leading-5">{finding.detail}</p>
                <p className="leading-5">{finding.provenance}</p>
                <time dateTime={finding.at} className="mt-1 block leading-5">
                  Record checked or dated {displayDate(finding.at)}
                </time>
                <ul className="mt-2 list-disc pl-4">
                  {finding.evidence.map((e) => (
                    <li key={e.href}>
                      <Link
                        href={e.href}
                        className="inline-flex min-h-11 items-center text-primary underline underline-offset-4"
                      >
                        {e.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </details>
          <AskCareOS
            context={{
              twinId: p.id,
              name: p.name,
              model: p.model,
              origin: p.origin,
              purchasedOn: p.purchasedOn,
            }}
            label={`Ask North about ${p.name}, purchased ${p.purchasedOn}`}
          >
            <OwnershipIcon topic="north" className="size-4" />
            <span className="hidden sm:inline">Ask North</span>
          </AskCareOS>
        </div>
        <div className="col-span-2 min-w-0 sm:col-span-1 sm:col-start-2">
          <OwnershipSummary topic={careItemTopic(item)} />
        </div>
        <div className="col-span-2 min-w-0 sm:col-span-1 sm:col-start-3 sm:row-start-2 sm:self-center">
          <Button
            asChild
            className="max-w-full flex-wrap whitespace-normal text-left"
          >
            <Link href={item.action.href}>
              {item.action.label}
              <ArrowRight className="shrink-0" aria-hidden="true" />
            </Link>
          </Button>
          <p className="mt-1 max-w-52 text-xs leading-4 text-muted-foreground">
            {item.status}
          </p>
        </div>
      </article>
    </OwnershipScope>
  );
}

export function CareFeedView({
  feed,
  completed,
  filters = true,
}: {
  feed: CareFeed;
  completed: boolean;
  filters?: boolean;
}) {
  const groups = completed
    ? ["completed" as const]
    : ["action" as const, "tracking" as const];
  const shown = careProductCards(feed, completed);
  return (
    <>
      <CareCollectionRefresh />
      {filters && (
        <div className="mb-7">
          <CareFilters completed={completed} />
        </div>
      )}
      {(!feed.complete || feed.unavailable.length > 0) && (
        <p
          role="status"
          className="mb-5 rounded-xl border bg-card p-4 text-sm leading-6 text-muted-foreground"
        >
          Some evidence is unavailable or incomplete
          {feed.unavailable.length ? `: ${feed.unavailable.join(", ")}` : ""}.
          Missing information is not an all-clear. Your saved purchases remain
          available.
        </p>
      )}
      {!shown.length && (
        <section className="rounded-2xl border bg-card px-6 py-10 text-center">
          <svg
            viewBox="0 0 80 48"
            className="mx-auto mb-4 h-12 w-20 text-primary"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M8 25h64M22 12v26m36-26v26"
              stroke="currentColor"
              strokeOpacity=".3"
              strokeWidth="2"
            />
            <circle
              cx="40"
              cy="25"
              r="13"
              className="fill-card"
              stroke="currentColor"
              strokeWidth="1.5"
            />
            <path
              d="m34 25 4 4 8-9"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <h2 className="text-lg font-semibold">
            {completed
              ? "No completed care tasks recorded."
              : feed.purchases.length
                ? "No actions found in your available records."
                : "No saved purchases are available."}
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted-foreground">
            {completed
              ? "Resolved tasks and verified outcomes appear with supporting records. Nothing has been marked complete for you."
              : "Care only surfaces findings supported by your records. You can still browse your products and their documents."}
          </p>
          <Link
            href="/purchases"
            className="mt-4 inline-flex min-h-11 items-center gap-2 font-semibold text-primary"
          >
            Browse purchases
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </section>
      )}
      {groups.map((group) => {
        const items = shown.filter(({ item }) => item.group === group);
        if (!items.length) return null;
        const title =
          group === "completed"
            ? "Completed care"
            : group === "tracking"
              ? "Being tracked — no action needed"
              : "Worth a look";
        return (
          <section key={group} aria-label={title} className="mb-8">
            <h2 className="mb-4 text-sm font-semibold text-muted-foreground">
              {title}
            </h2>
            <div className="space-y-4">
              {items.map((card) => (
                <CareCard {...card} key={card.item.purchase.id} />
              ))}
            </div>
          </section>
        );
      })}
      <details className="mt-7 text-sm text-muted-foreground">
        <summary className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          About your Care coverage
        </summary>
        <ul className="mt-2 list-disc space-y-2 pl-5 leading-6">
          <li>{feed.tracking.watches}</li>
          <li>{feed.tracking.returns}</li>
          <li>{feed.tracking.warranties}</li>
          <li>
            Fictional goods do not ship or carry a real warranty. Verified
            Sandbox payment evidence establishes payment only.
          </li>
        </ul>
        <Link
          href="/purchases"
          className="mt-2 inline-flex min-h-11 items-center font-semibold text-primary"
        >
          Explore products, documents and available care
        </Link>
      </details>
    </>
  );
}

export function CareFilters({ completed }: { completed: boolean }) {
  return (
    <nav aria-label="Care filters" className="flex flex-wrap gap-2">
      {[
        [false, "Needs attention"],
        [true, "Completed"],
      ].map(([selected, label]) => (
        <Link
          key={String(label)}
          href={selected ? "/dashboard?status=completed" : "/dashboard"}
          aria-current={completed === selected ? "page" : undefined}
          className={`inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold ${completed === selected ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card text-muted-foreground hover:text-foreground"}`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
