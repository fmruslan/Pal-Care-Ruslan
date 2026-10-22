import { Sparkles, ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { Badge } from "./ui/badge";

export function CareOSPanel({ compact = false }: { compact?: boolean }) {
  return (
    <div className="intelligence-wash rounded-3xl border p-6 sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-sm font-semibold text-intelligence-foreground">
          <Sparkles className="size-4" aria-hidden="true" />
          CareOS intelligence
        </span>
        <Badge tone="intelligence">Planned</Badge>
      </div>
      <h2 className="mt-5 text-xl font-semibold">
        More than a receipt.
        <br />A little peace of mind.
      </h2>
      <p className="mt-3 text-sm leading-7 text-muted-foreground">
        {compact
          ? "Your product passport is ready for smarter care. AI guidance and monitoring are not connected yet."
          : "A home for source-backed product guidance, helpful reminders, and better next steps. AI Product Care, Price Guardian, and recall monitoring are not active yet."}
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
