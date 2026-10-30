import Link from "next/link";
import {
  Archive,
  ArrowUpRight,
  Building2,
  ChevronDown,
  FileText,
  LayoutDashboard,
  ShieldCheck,
  Sparkles,
  ChartNoAxesCombined,
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

const customerIcons = {
  "/dashboard": LayoutDashboard,
  "/vault": Archive,
  "/insights": Sparkles,
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
          label: "CareOS Intelligence",
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
      "Purchase Twin");
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[224px_minmax(0,1fr)]">
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
            <Link
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
            </Link>
          ))}
        </nav>
        <div className="mt-auto p-5">
          <div className="intelligence-wash rounded-2xl border p-4">
            <Sparkles
              className="mb-3 size-5 text-intelligence-foreground"
              aria-hidden="true"
            />
            <p className="text-sm font-semibold">Powered by CareOS</p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              One product passport.
              <br />A more thoughtful future.
            </p>
            <Badge tone="intelligence" className="mt-3">
              CareOS · records & guidance
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
      <div className="min-w-0">
        <header className="relative flex min-h-18 flex-wrap items-center justify-between gap-3 border-b bg-sidebar px-5 py-3 sm:px-8 lg:px-8">
          <div className="lg:hidden">
            <Brand href={merchant ? "/merchant" : "/dashboard"} />
          </div>
          <div className="hidden items-center gap-2 text-sm font-medium text-muted-foreground lg:flex">
            <span className="size-2 rounded-full bg-brand" aria-hidden="true" />
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
                  <span className="sr-only sm:not-sr-only">Customer view</span>
                  <ArrowUpRight
                    className="hidden sm:block"
                    aria-hidden="true"
                  />
                </Link>
              </Button>
            ) : (
              <details className="lg:relative">
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl border border-input bg-card px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
                  Explore
                  <ChevronDown className="size-4" aria-hidden="true" />
                </summary>
                <nav
                  aria-label="More to explore"
                  className="absolute right-5 z-50 mt-2 w-[min(18rem,calc(100vw-2.5rem))] rounded-2xl border bg-card p-2 shadow-card lg:right-0"
                >
                  {customerExploreNavigation.map(({ href, label }) => (
                    <Link
                      key={href}
                      href={href}
                      aria-current={active === href ? "page" : undefined}
                      className="flex min-h-11 items-center rounded-xl px-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      {label}
                    </Link>
                  ))}
                </nav>
              </details>
            )}
          </div>
        </header>
        <main
          id="main-content"
          className="mx-auto max-w-[1280px] break-words px-5 py-5 sm:px-8 sm:py-6"
        >
          <div
            role="note"
            className="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl border bg-card px-4 py-2 text-sm text-muted-foreground"
          >
            <span className="inline-flex items-center gap-2">
              <ShieldCheck
                className="size-4 shrink-0 text-primary"
                aria-hidden="true"
              />
              <span>
                <strong className="font-medium text-foreground">
                  Sandbox demo.
                </strong>{" "}
                Fictional customer. Sample and verified Sandbox records. No real
                money.
              </span>
            </span>
            <details className="relative">
              <summary className="min-h-9 cursor-pointer py-1 text-primary underline-offset-4 hover:underline">
                About this demo
              </summary>
              <div className="mt-2 max-w-xl text-sm leading-6">
                Forma and Hearth products are fictional. The Raspberry Pi 5
                reference has sample ownership only. Sample records are labeled.
                Only completed PayPal Sandbox captures are labeled verified.{" "}
                {source === "database"
                  ? "PostgreSQL demo records."
                  : "Bundled preview · database not in use."}{" "}
                Independent project, not an official PayPal product or coverage
                promise.
              </div>
            </details>
          </div>
          {children}
        </main>
        <footer className="mx-auto flex max-w-[1440px] flex-wrap justify-between gap-3 px-5 pt-3 pb-[calc(7rem+env(safe-area-inset-bottom))] text-sm leading-6 text-muted-foreground sm:px-8 lg:px-10 lg:pb-8">
          <span>Pal Care · Powered by CareOS</span>
          <span>Independent Sandbox demo · No coverage promise</span>
        </footer>
      </div>
      <nav
        aria-label="Mobile navigation"
        className={`fixed inset-x-0 bottom-0 z-40 grid ${merchant ? "grid-cols-2" : "grid-cols-4"} border-t bg-card px-2 pt-2 pb-[max(.5rem,env(safe-area-inset-bottom))] shadow-card lg:hidden`}
      >
        {links.map(({ href, mobile, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={selected === href ? "page" : undefined}
            className={`flex min-h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 text-center text-xs font-medium transition-colors ${selected === href ? "bg-secondary text-primary" : "text-muted-foreground hover:bg-accent"}`}
          >
            <Icon className="size-5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 max-w-full break-words">{mobile}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
