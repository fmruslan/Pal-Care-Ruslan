"use client";
import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Sparkles, X } from "lucide-react";
import type { BriefingItem } from "@/lib/careos/briefing";
import { Button } from "../ui/button";

const dismissalKey = "palcare-careos-dismissed";
function subscribe(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener("careos-dismiss", listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener("careos-dismiss", listener);
  };
}
function snapshot() {
  try {
    return localStorage.getItem(dismissalKey) ?? "[]";
  } catch {
    return "[]";
  }
}
function storedIds(raw: string): string[] {
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value)
      ? value.filter((v): v is string => typeof v === "string").slice(-100)
      : [];
  } catch {
    return [];
  }
}

export function CareBriefing({ items }: { items: BriefingItem[] }) {
  const [local, setLocal] = useState<string[]>([]);
  const saved = useSyncExternalStore(subscribe, snapshot, () => "[]");
  const dismissed = [...storedIds(saved), ...local];
  function dismiss(id: string) {
    const updated = [...dismissed, id].slice(-100);
    setLocal(updated);
    try {
      localStorage.setItem(dismissalKey, JSON.stringify(updated));
      window.dispatchEvent(new Event("careos-dismiss"));
    } catch {
      /* Browser-local only. */
    }
  }
  const active = items.filter((item) => !dismissed.includes(item.id));
  return (
    <section
      aria-labelledby="careos-briefing"
      className="intelligence-wash mb-5 rounded-2xl border p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-intelligence-foreground">
            <Sparkles className="size-4" aria-hidden="true" />
            CareOS · Your purchase companion
          </p>
          <h2
            id="careos-briefing"
            className="mt-2 text-xl font-semibold sm:text-2xl"
          >
            A little less to keep track of.
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Saved receipts and supported product guidance, close at hand.
          </p>
        </div>
        <Button
          asChild
          variant="outline"
          size="sm"
          className="border-intelligence-foreground bg-transparent text-intelligence-foreground hover:bg-card"
        >
          <Link href="/insights">
            View Insights <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        {active.map((item) => (
          <article
            key={item.id}
            className="relative min-w-0 rounded-xl border bg-card p-4"
          >
            <button
              type="button"
              aria-label={`Dismiss ${item.title}`}
              onClick={() => dismiss(item.id)}
              className="absolute top-1 right-1 flex size-11 items-center justify-center rounded-xl text-muted-foreground hover:bg-accent"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
            <p className="pr-7 text-xs font-medium text-intelligence-foreground">
              {item.provenance}
            </p>
            <h3 className="mt-2 pr-3 text-base font-semibold">{item.title}</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              {item.detail}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button
                asChild
                variant={
                  item.action.href.endsWith("/care") ? "care" : "intelligence"
                }
                size="sm"
              >
                <Link href={item.action.href}>
                  {item.action.label}
                  <ArrowUpRight aria-hidden="true" />
                </Link>
              </Button>
              <Link
                href={item.sourceHref}
                className="inline-flex min-h-11 items-center text-xs font-medium text-primary underline underline-offset-4"
              >
                Inspect source
              </Link>
            </div>
          </article>
        ))}
      </div>
      {!active.length && (
        <p className="mt-4 text-sm text-muted-foreground">
          No additional updates in your saved records.{" "}
          <Link href="/vault" className="font-medium text-primary underline">
            Explore your purchases
          </Link>
        </p>
      )}
      <p className="mt-4 text-xs text-muted-foreground">
        Prepared from saved records · no model call. Recall, warranty and live
        price checks are not active.
      </p>
    </section>
  );
}
