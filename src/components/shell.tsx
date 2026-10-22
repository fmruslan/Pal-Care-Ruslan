import Link from "next/link";
import {
  Archive,
  ArrowUpRight,
  Building2,
  FileText,
  LayoutDashboard,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
} from "lucide-react";
import type { ReactNode } from "react";
import { Brand } from "./brand";
import { Button } from "./ui/button";
import { ThemeSelector } from "./theme-selector";
import { Badge } from "./ui/badge";

const navigation = [
  {
    href: "/dashboard",
    label: "Overview",
    mobile: "Home",
    icon: LayoutDashboard,
  },
  { href: "/vault", label: "Purchase vault", mobile: "Vault", icon: Archive },
  {
    href: "/documents",
    label: "Documents",
    mobile: "Documents",
    icon: FileText,
  },
  { href: "/shop", label: "Demo shop", mobile: "Shop", icon: ShoppingBag },
];

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
      ]
    : navigation;
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-dvh flex-col border-r bg-card lg:flex">
        <div className="px-7 py-8">
          <Brand href="/dashboard" />
          <p className="mt-5 text-sm text-muted-foreground">
            {merchant ? "Your merchant workspace" : "Your everyday, cared for."}
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
              aria-current={active === href ? "page" : undefined}
              className={`flex min-h-12 items-center gap-3 rounded-xl px-4 text-sm font-medium transition-colors ${active === href ? "bg-secondary text-primary" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}
            >
              <Icon className="size-[18px]" aria-hidden="true" />
              {label}
              {active === href && (
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
              AI features planned
            </Badge>
          </div>
          <Link
            href={merchant ? "/dashboard" : "/merchant"}
            className="mt-4 flex min-h-11 items-center justify-between px-2 text-sm font-medium text-muted-foreground"
          >
            {merchant ? "Customer workspace" : "Merchant workspace"}
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="flex min-h-22 flex-wrap items-center justify-between gap-3 border-b bg-card px-5 py-4 sm:px-8 lg:px-10">
          <div className="lg:hidden">
            <Brand href="/dashboard" />
          </div>
          <div className="hidden items-center gap-2 text-sm font-medium text-muted-foreground lg:flex">
            <span className="size-2 rounded-full bg-brand" aria-hidden="true" />
            {merchant ? "Everyday Goods" : "Alex’s care space"}
            <span className="text-border" aria-hidden="true">
              /
            </span>
            <span className="text-foreground">
              {merchant
                ? "Merchant overview"
                : (navigation.find((link) => link.href === active)?.label ??
                  "Purchase Twin")}
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
            <ThemeSelector />
            <Button
              asChild
              variant="outline"
              size="sm"
              className="px-3 sm:px-4"
            >
              <Link
                href={merchant ? "/dashboard" : "/merchant"}
                title={merchant ? "Customer view" : "Merchant view"}
              >
                {merchant ? (
                  <LayoutDashboard className="sm:hidden" aria-hidden="true" />
                ) : (
                  <Building2 className="sm:hidden" aria-hidden="true" />
                )}
                <span className="sr-only sm:not-sr-only">
                  {merchant ? "Customer view" : "Merchant view"}
                </span>
                <ArrowUpRight className="hidden sm:block" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </header>
        <main
          id="main-content"
          className="mx-auto max-w-[1440px] px-5 py-6 sm:px-8 sm:py-8 lg:px-10"
        >
          <div
            role="note"
            className="mb-7 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl border bg-card px-4 py-3 text-sm text-muted-foreground"
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
                Fictional products and customer. No real money.
              </span>
            </span>
            <details className="relative">
              <summary className="min-h-9 cursor-pointer py-1 text-primary underline-offset-4 hover:underline">
                About this demo
              </summary>
              <div className="mt-2 max-w-xl text-sm leading-6">
                Sample records are labeled. Only completed PayPal Sandbox
                captures are labeled verified.{" "}
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
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-4 border-t bg-card px-2 pt-2 pb-[max(.5rem,env(safe-area-inset-bottom))] shadow-card lg:hidden"
      >
        {navigation.map(({ href, mobile, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={active === href ? "page" : undefined}
            className={`flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-xs font-medium transition-colors ${active === href ? "bg-secondary text-primary" : "text-muted-foreground hover:bg-accent"}`}
          >
            <Icon className="size-5" aria-hidden="true" />
            {mobile}
          </Link>
        ))}
      </nav>
    </div>
  );
}
