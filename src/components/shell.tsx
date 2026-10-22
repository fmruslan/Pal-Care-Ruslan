import Link from "next/link";
import {
  Archive,
  ArrowUpRight,
  Building2,
  FileText,
  LayoutDashboard,
  ShieldCheck,
} from "lucide-react";
import type { ReactNode } from "react";
import { Brand } from "./brand";
import { Button } from "./ui/button";

const navigation = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/vault", label: "Purchase vault", icon: Archive },
  { href: "/documents", label: "Documents", icon: FileText },
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
    ? [{ href: "/merchant", label: "Merchant overview", icon: Building2 }]
    : navigation;
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="border-b border-border bg-card lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between px-5 py-5 lg:px-7 lg:py-9">
          <Brand href="/dashboard" />
          <span className="rounded-full bg-secondary px-2.5 py-1 text-[10px] font-bold tracking-widest text-primary lg:hidden">
            FOUNDATION
          </span>
        </div>
        <p className="hidden px-7 pb-4 text-[10px] font-bold tracking-[.2em] text-muted-foreground lg:block">
          {merchant ? "MERCHANT WORKSPACE" : "YOUR EVERYDAY, CARED FOR"}
        </p>
        <nav
          aria-label={merchant ? "Merchant navigation" : "Main navigation"}
          className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:px-4"
        >
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={active === href ? "page" : undefined}
              className={`flex min-h-12 shrink-0 items-center gap-3 rounded-xl px-4 text-sm font-medium transition-colors ${active === href ? "bg-primary text-white" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`}
            >
              <Icon className="size-[18px]" aria-hidden="true" />
              {label}
              {active === href && (
                <span
                  aria-hidden="true"
                  className="ml-auto hidden size-1.5 rounded-full bg-[#dce9c8] lg:block"
                />
              )}
            </Link>
          ))}
        </nav>
        <div className="mt-auto hidden p-5 lg:block">
          <div className="rounded-2xl bg-secondary p-4">
            <ShieldCheck
              className="mb-3 size-6 text-primary"
              aria-hidden="true"
            />
            <p className="text-sm font-semibold">Care starts with trust.</p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              A public demo. Fictional records. No real money.
            </p>
          </div>
          <Link
            href={merchant ? "/dashboard" : "/merchant"}
            className="mt-4 flex min-h-11 items-center justify-between px-2 text-xs font-medium text-muted-foreground"
          >
            {merchant ? "Customer workspace" : "Merchant workspace"}
            <ArrowUpRight className="size-4" aria-hidden="true" />
          </Link>
          <p className="mt-6 px-2 text-[10px] tracking-widest text-muted-foreground">
            POWERED BY CAREOS
          </p>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="flex min-h-20 items-center justify-between gap-3 border-b border-border px-5 sm:px-8 lg:px-12">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span
              className="size-1.5 rounded-full bg-primary"
              aria-hidden="true"
            />
            {merchant ? "Merchant workspace" : "Your personal care space"}
          </div>
          <div className="flex items-center gap-2 sm:gap-4">
            <span className="hidden text-xs text-muted-foreground sm:block">
              {merchant
                ? "Everyday Goods · fictional merchant"
                : "Alex · fictional customer"}
            </span>
            <Button asChild variant="outline" size="sm">
              <Link href={merchant ? "/dashboard" : "/merchant"}>
                {merchant ? "Customer view" : "Merchant view"}
                <ArrowUpRight aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </header>
        <main
          id="main-content"
          className="mx-auto max-w-[1400px] px-5 py-8 sm:px-8 lg:px-12 lg:py-10"
        >
          <div
            role="note"
            className="mb-8 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-secondary px-4 py-3 text-xs leading-5"
          >
            <span>
              <strong>Sample demo</strong> · All products, purchases, documents
              and events are fictional. No PayPal transactions yet.
            </span>
            <span className="font-medium">
              {source === "database"
                ? "PostgreSQL sample records"
                : "Bundled preview · database not in use"}
            </span>
          </div>
          {children}
        </main>
        <footer className="mx-auto max-w-[1400px] px-5 pb-8 text-xs leading-relaxed text-muted-foreground sm:px-8 lg:px-12">
          <span className="font-medium">Pal Care · Stage 1 foundation.</span>{" "}
          Independent hackathon project. Not an official PayPal product or
          coverage promise.
          <Link
            href={merchant ? "/dashboard" : "/merchant"}
            className="mt-3 block underline underline-offset-4 lg:hidden"
          >
            {merchant ? "Customer workspace" : "Merchant workspace"}
          </Link>
        </footer>
      </div>
    </div>
  );
}
