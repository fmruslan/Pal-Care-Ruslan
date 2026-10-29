import { Sparkles, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { Badge } from "./ui/badge";

export function CareOSPanel({ compact = false }: { compact?: boolean }) {
  return (
    <div className="intelligence-wash rounded-2xl border p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-intelligence-foreground">
          <Sparkles className="size-4" aria-hidden="true" />
          CareOS intelligence
        </span>
        <Badge tone="intelligence">Records & guidance</Badge>
      </div>
      <h2 className="mt-5 text-xl font-semibold">
        The details, already together.
      </h2>
      <p className="mt-3 text-sm leading-7 text-muted-foreground">
        {compact
          ? "Find saved receipts, explore matched guidance and keep purchase details close. Live monitoring is not active."
          : "CareOS brings receipts, purchase details and available product guidance together. Fixture answers are demonstrations; no live AI inference is claimed."}
      </p>
      {!compact && (
        <Link
          href="/vault"
          className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-intelligence-foreground"
        >
          Explore a Purchase Twin
          <ArrowUpRight className="size-4" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}
