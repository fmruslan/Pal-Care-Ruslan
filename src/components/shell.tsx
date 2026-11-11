import Link from "next/link";
import {
  ArrowUpRight,
  Building2,
  ChevronDown,
  FileText,
  LayoutDashboard,
  Package,
  ChartNoAxesCombined,
  Info,
} from "lucide-react";
import type { ReactNode } from "react";
import {
  customerNavigation,
  customerExploreNavigation,
  customerSection,
} from "@/lib/customer-navigation";
import { Brand } from "./brand";
import { Button } from "./ui/button";
import { ThemeSelector } from "./theme-selector";
import { Badge } from "./ui/badge";
import { NorthWorkspaceSlot } from "@/components/careos/integrated";
import { WorkspaceNavigationLink } from "./intelligence/workspace-navigation-link";
import {
  northReviewPresentation,
  northReviewLivePresentation,
} from "@/lib/private-preview-origin";

const customerIcons = {
  "/dashboard": LayoutDashboard,
  "/purchases": Package,
  "/insights": ChartNoAxesCombined,
  "/documents": FileText,
};

const navigation = customerNavigation.map((link) => ({
  ...link,
  mobile: link.label,
  icon: customerIcons[link.href],
}));

export function Shell({
  children,
  active,
  source,
  merchant = false,
}: {
  children: ReactNode;
  active: string;
  source: "fixtures" | "database";
  merchant?: boolean;
}) {
  const links = merchant
    ? [
        {
          href: "/merchant",
          label: "Merchant overview",
          mobile: "Merchant",
          icon: Building2,
        },
        {
          href: "/merchant/intelligence",
          label: "Merchant intelligence",
          mobile: "Intelligence",
          icon: ChartNoAxesCombined,
        },
      ]
    : navigation;
  const selected = merchant ? active : customerSection(active)?.href;
  const sectionLabel = merchant
    ? (links.find((link) => link.href === active)?.label ??
      "Merchant workspace")
    : (customerSection(active)?.label ??
      customerExploreNavigation.find((link) => link.href === active)?.label ??
      "Purchase details");
  return (
    <div
      className={`min-h-screen ${merchant ? "lg:grid lg:grid-cols-[224px_minmax(0,1fr)]" : "customer-shell"}`}
    >
      {merchant && (
        <aside className="sticky top-0 hidden h-dvh flex-col border-r bg-sidebar lg:flex">
          <div className="px-7 py-6">
            <Brand href={merchant ? "/merchant" : "/dashboard"} />
            <p className="mt-5 text-sm text-muted-foreground">
              {merchant
                ? "Your merchant workspace"
                : "Everything you own. All cared for."}
            </p>
          </div>
          <nav
            aria-label={merchant ? "Merchant navigation" : "Main navigation"}
            className="space-y-1 px-4"
          >
            {links.map(({ href, label, icon: Icon }) => (
              <WorkspaceNavigationLink
                key={href}
                href={href}
                aria-current={selected === href ? "page" : undefined}
                className={`flex min-h-12 items-center gap-3 rounded-xl px-4 text-sm font-medium transition-colors ${selected === href ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}
              >
                <Icon className="size-[18px]" aria-hidden="true" />
                {label}
                {selected === href && (
                  <span
                    className="ml-auto size-1.5 rounded-full bg-primary"
                    aria-hidden="true"
                  />
                )}
              </WorkspaceNavigationLink>
            ))}
          </nav>
          <div className="mt-auto p-5">
            <div className="intelligence-wash rounded-2xl border p-4">
              <FileText
                className="mb-3 size-5 text-intelligence-foreground"
                aria-hidden="true"
              />
              <p className="text-sm font-semibold">
                Your purchases, close at hand.
              </p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Receipts, records and available product guidance in one place.
              </p>
              <Badge tone="intelligence" className="mt-3">
                Saved records · clear sources
              </Badge>
            </div>
            {merchant && (
              <Link
                href="/dashboard"
                className="mt-4 flex min-h-11 items-center justify-between px-2 text-sm font-medium text-muted-foreground"
              >
                Customer workspace
                <ArrowUpRight className="size-4" aria-hidden="true" />
              </Link>
            )}
          </div>
        </aside>
      )}
      <div className="min-w-0">
        {!merchant && (
          <header className="customer-header border-b bg-sidebar">
            <div className="customer-header-inner mx-auto max-w-[1280px] px-5 sm:px-8">
              <Brand href="/dashboard" />
              <div className="customer-appearance">
                <ThemeSelector />
              </div>
              <nav
                aria-label="Main navigation"
                className="customer-primary-nav flex min-w-0 gap-1"
              >
                {links.map(({ href, label }) => (
                  <WorkspaceNavigationLink
                    key={href}
                    href={href}
                    aria-current={selected === href ? "page" : undefined}
                    className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg px-1 text-sm font-semibold transition-colors sm:px-4 ${selected === href ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}
                  >
                    {label}
                  </WorkspaceNavigationLink>
                ))}
              </nav>
            </div>
          </header>
        )}
        {merchant && (
          <header className="relative flex min-h-18 flex-wrap items-center justify-between gap-3 border-b bg-sidebar px-5 py-3 sm:px-8 lg:px-8">
            <div className="lg:hidden">
              <Brand href={merchant ? "/merchant" : "/dashboard"} />
            </div>
            <div className="hidden items-center gap-2 text-sm font-medium text-muted-foreground lg:flex">
              <span
                className="size-2 rounded-full bg-brand"
                aria-hidden="true"
              />
              {merchant ? "Everyday Goods" : "Alex’s care space"}
              <span className="text-border" aria-hidden="true">
                /
              </span>
              <span className="text-foreground">{sectionLabel}</span>
            </div>
            <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2 sm:gap-3">
              <ThemeSelector />
              {merchant ? (
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="px-3 sm:px-4"
                >
                  <Link href="/dashboard" title="Customer view">
                    <LayoutDashboard className="sm:hidden" aria-hidden="true" />
                    <span className="sr-only sm:not-sr-only">
                      Customer view
                    </span>
                    <ArrowUpRight
                      className="hidden sm:block"
                      aria-hidden="true"
                    />
                  </Link>
                </Button>
              ) : (
                <details className="lg:relative">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl border border-input bg-card px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                    More tools
                    <ChevronDown className="size-4" aria-hidden="true" />
                  </summary>
                  <nav
                    aria-label="More tools"
                    className="absolute right-5 z-50 mt-2 w-[min(18rem,calc(100vw-2.5rem))] rounded-2xl border bg-card p-2 shadow-card lg:right-0"
                  >
                    {customerExploreNavigation.map(
                      ({ href, label, description }) => (
                        <Link
                          key={href}
                          href={href}
                          aria-current={active === href ? "page" : undefined}
                          className="flex min-h-11 flex-col items-start rounded-xl px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                        >
                          <span>{label}</span>
                          <span
                            id={`customer-tool-${href.slice(1)}`}
                            className="mt-1 text-xs leading-5 font-normal"
                          >
                            {description}
                          </span>
                        </Link>
                      ),
                    )}
                  </nav>
                </details>
              )}
            </div>
          </header>
        )}
        <main
          id="main-content"
          className={`mx-auto max-w-[1280px] break-words px-5 py-4 sm:px-8 sm:py-6 ${merchant ? "" : "customer-main"}`}
        >
          {!merchant && <NorthWorkspaceSlot />}
          {northReviewPresentation(process.env) && (
            <details
              aria-label="Private North testing preview"
              className="customer-review-disclosure mb-3 rounded-xl border border-intelligence-border bg-intelligence px-4 text-sm"
            >
              <summary className="min-h-11 cursor-pointer py-3 font-semibold text-intelligence-foreground">
                North ☆ · Private testing preview :8445
              </summary>
              <p className="mt-1">
                {northReviewLivePresentation(process.env) ? (
                  "Conversational AI is configured here. Browser authentication, provider permission and the existing shared allowance are checked for every model call. Without access, North offers only limited saved-record assistance."
                ) : (
                  <>
                    Saved-record mode — live AI is not authorized on this URL.
                    Searches, lists, recorded totals, comparisons, documents and
                    native charts work without AI. For care, open a product’s
                    saved guidance.
                  </>
                )}
              </p>
              <p className="mt-1 text-muted-foreground">
                Fictional demo records only. Your existing Pal Care preview and
                financial safeguards are unchanged. No new AI allowance is
                created.
              </p>
              <p
                className="mt-2 break-all text-xs text-muted-foreground"
                data-review-build={
                  process.env.PALCARE_NORTH_REVIEW_BUILD_ID || "unavailable"
                }
              >
                Review :8445 · Build{" "}
                {process.env.PALCARE_NORTH_REVIEW_BUILD_ID ||
                  "identity unavailable"}
              </p>
              <details className="mt-1 text-xs text-muted-foreground">
                <summary className="cursor-pointer py-1">
                  Running source identity
                </summary>
                <dl className="space-y-1 break-all py-2">
                  <div>
                    <dt className="font-semibold">Commit baseline</dt>
                    <dd>
                      {process.env.PALCARE_NORTH_REVIEW_COMMIT || "unavailable"}
                      {process.env.PALCARE_NORTH_REVIEW_DIRTY === "true"
                        ? " + working changes"
                        : ""}
                    </dd>
                  </div>
                  <div>
                    <dt className="font-semibold">Source SHA-256</dt>
                    <dd>
                      {process.env.PALCARE_NORTH_REVIEW_SOURCE_HASH ||
                        "unavailable"}
                    </dd>
                  </div>
                </dl>
              </details>
            </details>
          )}
          <div
            role="note"
            className="demo-notice customer-demo-disclosure mb-4 text-sm text-muted-foreground"
          >
            <details className="demo-details">
              <summary className="flex min-h-11 w-fit cursor-pointer list-none items-center gap-2 rounded-lg text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                <Info className="size-4 shrink-0" aria-hidden="true" />
                <span>Example purchases &amp; PayPal Sandbox</span>
                <ChevronDown className="size-3.5 shrink-0" aria-hidden="true" />
              </summary>
              <div className="max-w-2xl rounded-xl border bg-card p-4 text-sm leading-6">
                <strong className="font-medium text-foreground">
                  About these purchases.
                </strong>{" "}
                Explore fictional example purchases alongside verified PayPal
                Sandbox purchases. Sandbox payments use no real money. Each
                purchase keeps its own receipt, dates and sources; a payment
                does not confirm delivery, warranty coverage or product safety.
                Forma and Hearth are fictional brands. Raspberry Pi 5 has a
                sample ownership record, not a verified purchase.{" "}
                {source === "database"
                  ? "You’re viewing saved purchase records."
                  : "You’re viewing the built-in example collection."}{" "}
                Pal Care is an independent project, not an official PayPal
                service.
              </div>
            </details>
          </div>
          {children}
        </main>
        <footer
          className={`mx-auto flex max-w-[1280px] flex-wrap justify-between gap-3 px-5 pt-6 text-xs leading-6 text-muted-foreground sm:px-8 ${merchant ? "pb-[calc(7rem+env(safe-area-inset-bottom))] lg:pb-8" : "pb-[calc(2rem+env(safe-area-inset-bottom))]"}`}
        >
          <span>Pal Care</span>
          <Link href="/about" className="underline underline-offset-4">
            About Pal Care
          </Link>
        </footer>
      </div>
      {merchant && (
        <nav
          aria-label="Mobile navigation"
          className={`fixed inset-x-0 bottom-0 z-40 grid ${merchant ? "grid-cols-2" : "grid-cols-4"} border-t bg-card px-2 pt-2 pb-[max(.5rem,env(safe-area-inset-bottom))] shadow-card lg:hidden`}
        >
          {links.map(({ href, mobile, icon: Icon }) => (
            <WorkspaceNavigationLink
              key={href}
              href={href}
              aria-current={selected === href ? "page" : undefined}
              className={`flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-center text-xs font-medium transition-colors ${selected === href ? "bg-secondary text-primary" : "text-muted-foreground hover:bg-accent"}`}
            >
              <Icon className="size-5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 max-w-full break-words">{mobile}</span>
            </WorkspaceNavigationLink>
          ))}
        </nav>
      )}
    </div>
  );
}
