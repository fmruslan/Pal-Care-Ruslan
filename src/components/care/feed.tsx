import { ArrowRight, Check, Info } from "lucide-react";
import { WorkspaceNavigationLink as Link } from "../intelligence/workspace-navigation-link";
import { ProductArt } from "../product-art";
import { Button } from "../ui/button";
import { displayDate } from "@/lib/demo/presentation";
import type { CareFeed, CareItem } from "@/lib/care/model";

function CareCard({ item }: { item: CareItem }) {
  const p = item.purchase;
  return (
    <article
      className="care-action-card grid min-w-0 grid-cols-[minmax(0,20%)_minmax(0,1fr)] items-start gap-x-4 gap-y-2 rounded-2xl border bg-card p-4 shadow-sm [overflow-wrap:anywhere] sm:grid-cols-[6rem_minmax(0,1fr)_auto] sm:gap-x-6 sm:p-6"
      data-care-card={item.id}
    >
      <div className="care-product-art min-w-0 sm:row-span-3 sm:self-center">
        <ProductArt kind={p.illustration ?? "computer"} size="thumbnail" />
      </div>
      <div className="min-w-0">
        <p className="text-xs leading-5 text-muted-foreground">
          {p.model} ·{" "}
          <time dateTime={p.purchasedOn}>{displayDate(p.purchasedOn)}</time> ·{" "}
          {p.origin === "sandbox" ? "Sandbox purchase" : "Sample purchase"}
        </p>
        <h3 className="mt-1 text-base font-semibold tracking-tight">
          <Link href={p.href} className="hover:text-primary hover:underline">
            {p.name}
          </Link>
        </h3>
        <p
          className={`mt-2 flex items-center gap-2 text-sm font-semibold ${item.verified ? "text-success-foreground" : "text-foreground"}`}
        >
          {item.verified && (
            <Check className="size-4 shrink-0" aria-hidden="true" />
          )}
          {item.status}
        </p>
      </div>
      <p className="col-span-2 text-sm leading-6 text-muted-foreground sm:col-span-1 sm:col-start-2 sm:row-start-2">
        {item.summary ?? item.detail}
      </p>
      <div className="col-span-2 flex min-w-0 flex-wrap items-center justify-between gap-2 sm:contents">
        <details className="min-w-0 text-xs text-muted-foreground sm:col-start-2 sm:row-start-3">
          <summary className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
            <Info className="size-3.5" aria-hidden="true" />
            Evidence & source
          </summary>
          {item.summary && <p className="mb-2 leading-5">{item.detail}</p>}
          <p className="leading-5">{item.provenance}</p>
          <time dateTime={item.at} className="mt-1 block leading-5">
            Record checked or dated {displayDate(item.at)}
          </time>
          <ul className="mt-2 list-disc pl-4">
            {item.evidence.map((e) => (
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
        </details>
        <div className="min-w-0 sm:col-start-3 sm:row-span-3 sm:row-start-1 sm:self-center">
          <Button
            asChild
            className="max-w-full flex-wrap whitespace-normal text-left"
          >
            <Link href={item.action.href}>
              {item.action.label}
              <ArrowRight className="shrink-0" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </div>
    </article>
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
  const shown = feed.items.filter((item) =>
    groups.some((group) => group === item.group),
  );
  return (
    <>
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
        const items = shown.filter((item) => item.group === group);
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
              {items.map((item) => (
                <CareCard item={item} key={item.id} />
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
