import { ArrowUpRight } from "lucide-react";
import { AssistantName } from "./assistant-name";
import Link from "next/link";
import { Badge } from "./ui/badge";

export function CareOSPanel({ compact = false }: { compact?: boolean }) {
  return (
    <div className="intelligence-wash rounded-2xl border p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="inline-flex min-w-0 max-w-full flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-intelligence-foreground">
          <AssistantName /> <span>· Purchase guidance</span>
        </span>
        <Badge tone="intelligence">Records & guidance</Badge>
      </div>
      <h2 className="mt-5 text-xl font-semibold">
        The details, already together.
      </h2>
      <p className="mt-3 text-sm leading-7 text-muted-foreground">
        {compact
          ? "Find your saved receipts, purchase details and available product guides in one place. Live monitoring is not active."
          : "North is your Pal Care companion for saved receipts, purchase details and available product guidance. Example answers don’t use live AI."}
      </p>
      {!compact && (
        <Link
          href="/vault"
          className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-intelligence-foreground"
        >
          Explore your purchases
          <ArrowUpRight className="size-4" aria-hidden="true" />
        </Link>
      )}
    </div>
  );
}
