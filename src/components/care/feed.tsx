import { ArrowRight, Info } from "lucide-react";
import { WorkspaceNavigationLink as Link } from "../intelligence/workspace-navigation-link";
import { ProductArt } from "../product-art";
import { displayDate, money } from "@/lib/demo/presentation";
import type { CareFeed } from "@/lib/care/model";
import {
  careItemTopic,
  careProductCards,
  type CareFilter,
} from "@/lib/care/summary";
import {
  OwnershipScope,
  OwnershipPill,
  OwnershipSummary,
  CareCollectionRefresh,
  OwnershipPrimaryAction,
} from "./ownership";

type ProductCard = ReturnType<typeof careProductCards>[number];

/** Links always come from the particular dated purchase, never its group. */
function GroupedPurchaseHistory({
  members,
  selected,
}: {
  members: ProductCard["members"];
  selected: ProductCard["item"]["purchase"];
}) {
  if (members.length < 2) return null;
  const identity = (member: ProductCard["members"][number]) => (
    <>
      {member.origin === "sandbox" ? "Verified Sandbox" : "Sample"} ·{" "}
      {member.amountMinor === null
        ? "Price not added"
        : money(member.amountMinor)}{" "}
      · {displayDate(member.purchasedOn)}
    </>
  );
  return (
    <div
      className="mt-2 text-sm text-muted-foreground"
      data-care-purchase-history
    >
      {members
        .filter((member) => member.origin === "sandbox")
        .map((member) => {
          return member.receiptHref ? (
            <Link
              key={member.id}
              href={member.receiptHref}
              data-care-direct-receipt={member.id}
              className="inline-flex min-h-11 items-center text-primary underline underline-offset-4"
            >
              {identity(member)} · View receipt
            </Link>
          ) : null;
        })}
      <p className="text-xs leading-6">
        Care shown: {identity(selected)} only. Each purchase keeps its own
        sources and history.
      </p>
      <details>
        <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-lg focus-visible:outline-2 focus-visible:outline-ring">
          {members.length} purchases · receipts & history
        </summary>
        <ul className="space-y-1">
          {members.map((member) => {
            return (
              <li key={member.id} data-care-history-purchase={member.id}>
                <Link
                  className="inline-flex min-h-11 items-center text-primary underline"
                  href={member.href}
                >
                  {identity(member)} · Purchase & history
                </Link>
                {member.receiptHref && (
                  <Link
                    className="ml-3 inline-flex min-h-11 items-center text-primary underline"
                    href={member.receiptHref}
                  >
                    {identity(member)} · Receipt
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      </details>
    </div>
  );
}

function ConsumerCareCard({ item, view, members }: ProductCard) {
  const p = item.purchase;
  const fact = view!.facts.find(
    (f) => f.topic === view!.pill.topic && f.consumer,
  )!;
  return (
    <OwnershipScope view={view} surface="care">
      <article
        className="care-action-card flex h-full min-w-0 flex-col rounded-2xl border bg-card p-4 shadow-sm [overflow-wrap:anywhere] sm:p-5"
        data-care-card={item.id}
        data-care-product={p.id}
        data-care-consumer
      >
        <div className="flex min-w-0 items-center gap-4">
          <div className="care-product-art shrink-0 [&>div]:size-16 [&_svg]:h-16 [&_svg]:w-20 sm:[&>div]:size-18 sm:[&_svg]:h-18 sm:[&_svg]:w-22">
            <ProductArt kind={p.illustration ?? "computer"} size="thumbnail" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg leading-6 font-semibold">
              <Link
                href={p.href}
                className="hover:text-primary hover:underline"
              >
                {p.name}
              </Link>
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {p.amountMinor === null ? "Added" : "Purchased"}{" "}
              <time dateTime={p.purchasedOn}>{displayDate(p.purchasedOn)}</time>{" "}
              ·{" "}
              {p.amountMinor === null
                ? "Price not added"
                : money(p.amountMinor)}
            </p>
          </div>
        </div>
        <div className="mt-3">
          <OwnershipPill compact />
        </div>
        <p className="mt-2 text-[0.9375rem] leading-6 text-foreground">
          {fact.consumer!.summary}
        </p>
        <GroupedPurchaseHistory members={members} selected={p} />
        <div className="mt-auto pt-3">
          <OwnershipSummary topic={fact.topic} secondary />
          <div className="mt-2 border-t pt-2">
            <OwnershipPrimaryAction />
          </div>
        </div>
      </article>
    </OwnershipScope>
  );
}

function CareCard({
  item,
  findings,
  view,
  protection,
  quiet,
  members,
  headingLevel = 3,
}: ReturnType<typeof careProductCards>[number] & { headingLevel?: 2 | 3 }) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const p = item.purchase;
  const simulated = view?.facts.find((f) => f.simulation);
  if (view?.facts.some((f) => f.topic === view.pill.topic && f.consumer))
    return (
      <ConsumerCareCard
        item={item}
        findings={findings}
        view={view}
        protection={protection}
        quiet={quiet}
        members={members}
        group={item.group}
      />
    );
  const update = simulated
    ? (simulated.summary ?? simulated.status)
    : findings.length
      ? item.status
      : protection.label;
  const action = simulated
    ? {
        label:
          simulated.topic === "safety"
            ? "Review notice"
            : simulated.topic === "delivery"
              ? "Track demo delivery"
              : simulated.topic === "warranty"
                ? "View terms"
                : "Review example",
        href: simulated.action!.href,
      }
    : item.group === "action"
      ? item.action
      : protection.monitoring
        ? { label: "Protection details", href: `/care/${p.id}#price` }
        : { label: "Details", href: p.href };
  return (
    <OwnershipScope view={view} surface="care">
      <article
        className={`care-action-card min-w-0 rounded-2xl border bg-card p-3 [overflow-wrap:anywhere] sm:px-4 ${quiet ? "" : "shadow-sm"}`}
        data-care-card={item.id}
        data-care-product={p.id}
        data-care-quiet={quiet}
      >
        <div
          className={`grid min-w-0 items-start gap-x-3 gap-y-1 ${simulated ? "grid-cols-[3.25rem_minmax(0,1fr)] sm:grid-cols-[4rem_minmax(0,1fr)_auto]" : "grid-cols-[2.5rem_minmax(0,1fr)] sm:grid-cols-[3rem_minmax(0,1fr)_auto]"}`}
        >
          <div
            className={`care-product-art min-w-0 sm:row-span-2 sm:self-center ${simulated ? "[&>div]:size-13 [&_svg]:h-13 [&_svg]:w-16 sm:[&>div]:size-16 sm:[&_svg]:h-16 sm:[&_svg]:w-20" : "[&>div]:size-10 [&_svg]:h-10 [&_svg]:w-12 sm:[&>div]:size-12"}`}
          >
            <ProductArt kind={p.illustration ?? "computer"} size="thumbnail" />
          </div>
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1 sm:col-span-2">
            <div className="min-w-0">
              <Heading className="text-sm font-semibold">
                <Link
                  href={p.href}
                  className="hover:text-primary hover:underline"
                >
                  {p.name}
                </Link>
              </Heading>
              <p className="text-xs leading-5 text-muted-foreground">
                <time dateTime={p.purchasedOn}>
                  {displayDate(p.purchasedOn)}
                </time>{" "}
                ·{" "}
                {p.origin === "sandbox"
                  ? "Sandbox purchase"
                  : "Sample purchase"}{" "}
                {simulated ? "" : ` · ${p.model}`}
              </p>
            </div>
            <OwnershipPill compact />
          </div>
          <div className="col-span-2 flex min-w-0 flex-wrap items-center justify-between gap-x-3 sm:col-start-2">
            <p
              className={`text-xs leading-5 ${item.group === "action" ? "font-semibold text-foreground" : "text-muted-foreground"}`}
            >
              {update}
              {protection.state === "opportunity" &&
              protection.differenceMinor !== null
                ? ` · ${money(protection.differenceMinor)} potential adjustment, not savings`
                : ""}
            </p>
            <details className="min-w-0 text-xs text-muted-foreground">
              <summary
                className={`inline-flex ${simulated ? "min-h-11" : "min-h-8"} cursor-pointer items-center gap-1 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring`}
              >
                <Info className="size-3" aria-hidden="true" />
                Evidence
              </summary>
              <p className="mb-2 max-w-2xl leading-6">{protection.detail}</p>
              {findings.map((f) => (
                <div key={f.id} className="mb-3 max-w-2xl leading-6">
                  <p className="font-semibold">{f.status}</p>
                  <p>{f.detail}</p>
                  <p>
                    {f.provenance} · record dated {displayDate(f.at)}
                  </p>
                  <ul>
                    {f.evidence.map((e) => (
                      <li key={e.href}>
                        <Link
                          href={e.href}
                          className="inline-flex min-h-8 items-center text-primary underline underline-offset-4"
                        >
                          {e.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </details>
            <Link
              href={action.href}
              className={`inline-flex ${simulated ? "min-h-11" : "min-h-8"} max-w-full items-center gap-1 rounded-lg text-xs font-semibold text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${item.group === "action" ? "underline underline-offset-4" : ""}`}
            >
              {action.label}
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>
        <GroupedPurchaseHistory members={members} selected={p} />
        <div
          className={`${simulated ? "mt-1 pt-1" : "mt-2 pt-2"} border-t border-border/60`}
        >
          <OwnershipSummary
            topic={item.group === "action" ? careItemTopic(item) : "price"}
            secondary
          />
        </div>
      </article>
    </OwnershipScope>
  );
}

export function CareFeedView({
  feed,
  filter = "all",
  completed,
  filters = true,
}: {
  feed: CareFeed;
  filter?: CareFilter;
  completed?: boolean;
  filters?: boolean;
}) {
  const selected = completed ? "completed" : filter;
  const shown = careProductCards(feed, selected);
  const notifications = feed.protections.flatMap((protection) =>
    protection.notifications.map((notice) => ({ protection, notice })),
  );
  return (
    <>
      <CareCollectionRefresh />
      {filters && (
        <div className="mb-5">
          <CareFilters filter={selected} feed={feed} />
        </div>
      )}
      {(!feed.complete || feed.unavailable.length > 0) && (
        <p
          role="status"
          className="mb-4 rounded-xl border p-3 text-sm text-muted-foreground"
        >
          Some evidence is unavailable or incomplete
          {feed.unavailable.length ? `: ${feed.unavailable.join(", ")}` : ""}.
          Missing information is not an all-clear.
        </p>
      )}
      {notifications.length > 0 && (
        <section
          aria-label="Protection notifications"
          className="mb-5 rounded-xl border border-intelligence-border bg-intelligence p-3 text-sm"
        >
          <h2 className="font-semibold text-intelligence-foreground">
            Protection updates
          </h2>
          <ul className="mt-1 space-y-1">
            {notifications.map(({ protection, notice }) => (
              <li key={notice.id}>
                <Link
                  className="inline-flex min-h-8 items-center gap-2 text-intelligence-foreground underline underline-offset-4"
                  href={`/care/${protection.twinId}#price`}
                >
                  {feed.purchases.find((p) => p.id === protection.twinId)?.name}{" "}
                  ·{" "}
                  {notice.kind === "opportunity"
                    ? "Possible adjustment"
                    : "Window ending"}
                  {notice.historical
                    ? " · historical, review current evidence"
                    : ""}{" "}
                  · {displayDate(notice.at)}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-muted-foreground">
            Saved in-app updates only. No email, push or merchant request was
            sent.
          </p>
        </section>
      )}
      {!shown.length && (
        <section className="rounded-xl border bg-card p-5">
          <h2 className="text-base font-semibold">
            {selected === "completed"
              ? "No completed care tasks recorded."
              : selected === "watching"
                ? "No verified price-protection monitoring is active."
                : selected === "attention"
                  ? "No actionable care findings in the available records."
                  : selected === "protected"
                    ? "No coverage information is saved."
                    : "No saved purchases are available."}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            {selected === "completed"
              ? "Completed means a resolved tracking action, not simply a purchased product."
              : "Missing coverage is not an all-clear. All purchases remain available in the default view."}
          </p>
          <Link
            className="mt-2 inline-flex min-h-8 items-center text-sm font-semibold text-primary"
            href="/dashboard"
          >
            All purchases
          </Link>
        </section>
      )}
      {feed.demoAsOf ? (
        <section
          aria-label="Your products"
          className="grid min-w-0 grid-cols-1 items-stretch gap-3 min-[1050px]:grid-cols-2 [&>div]:h-full [&>div>article]:h-full"
        >
          {shown.map((card) => (
            <CareCard key={card.item.purchase.id} {...card} headingLevel={2} />
          ))}
        </section>
      ) : (
        (["action", "tracking", "completed"] as const).map((group) => {
          const cards = shown.filter((card) => card.group === group);
          if (!cards.length) return null;
          const title =
            group === "action"
              ? "Needs attention"
              : group === "tracking"
                ? "Being cared for"
                : "Completed";
          return (
            <section key={group} aria-label={title} className="mb-5">
              <h2 className="mb-2 text-xs font-semibold text-muted-foreground">
                {title}
              </h2>
              <div className="space-y-2">
                {cards.map((card) => (
                  <CareCard key={card.item.purchase.id} {...card} />
                ))}
              </div>
            </section>
          );
        })
      )}
      <details className="mt-5 text-xs text-muted-foreground">
        <summary className="inline-flex min-h-8 cursor-pointer items-center">
          About your Care coverage
        </summary>
        <ul className="mt-1 list-disc space-y-1 pl-4 leading-6">
          <li>
            Being cared for includes quiet ownership; it does not promise active
            monitoring.
          </li>
          <li>
            {feed.demoAsOf
              ? "Demo watches preview fictional price checks; they are not live external tracking. Real monitoring needs an applicable policy, supported source, schedule and recent successful checks."
              : "Watching requires a verified applicable policy/window, a supported source, an actual schedule and fresh successful checks."}
          </li>
          <li>{feed.tracking.watches}</li>
          <li>{feed.tracking.returns}</li>
          <li>{feed.tracking.warranties}</li>
          <li>
            Fictional goods do not ship or carry a real warranty. Verified
            Sandbox payment establishes payment only.
          </li>
        </ul>
      </details>
    </>
  );
}

export function CareFilters({
  filter = "all",
  feed,
  completed,
}: {
  filter?: CareFilter;
  feed?: CareFeed;
  completed?: boolean;
}) {
  const selected = completed ? "completed" : filter;
  return (
    <nav aria-label="Care filters" className="flex min-w-0 flex-wrap gap-1.5">
      {(
        [
          ["all", "All purchases"],
          ["attention", "Needs attention"],
          ["watching", "Watching"],
          ...(feed?.demoAsOf ? [["protected", "Coverage info"] as const] : []),
          ["completed", "Completed"],
        ] as const
      ).map(([value, label]) => (
        <Link
          key={value}
          href={value === "all" ? "/dashboard" : `/dashboard?status=${value}`}
          aria-current={selected === value ? "page" : undefined}
          className={`inline-flex ${feed?.demoAsOf ? "min-h-11 text-sm" : "min-h-9 text-xs"} items-center rounded-full border px-3 font-semibold ${selected === value ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card text-muted-foreground hover:text-foreground"}`}
        >
          {value === "all" && feed?.demoAsOf ? "All products" : label}
          {feed?.demoAsOf
            ? ` (${careProductCards(feed, value).length})`
            : value === "all" && feed
              ? ` (${feed.purchases.length})`
              : ""}
        </Link>
      ))}
    </nav>
  );
}
