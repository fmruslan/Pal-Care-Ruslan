import { Archive, FileText, ShieldCheck } from "lucide-react";

export function PurchaseMetrics({
  purchases,
  documents,
  verified,
}: {
  purchases: number;
  documents: number;
  verified: number;
}) {
  return (
    <dl
      className="mb-5 grid grid-cols-1 gap-3 min-[360px]:grid-cols-3"
      aria-label="Saved purchase totals"
    >
      {[
        { icon: Archive, value: purchases, label: "Available purchases" },
        { icon: FileText, value: documents, label: "Saved documents" },
        {
          icon: ShieldCheck,
          value: verified,
          label: "Verified Sandbox purchases",
        },
      ].map(({ icon: Icon, value, label }) => (
        <div
          key={label}
          className="flex min-w-0 flex-col rounded-2xl border bg-card p-4 shadow-card"
        >
          <dt className="order-last mt-2 text-sm leading-5 text-muted-foreground">
            {label}
          </dt>
          <dd className="flex items-center gap-3 text-xl leading-6 font-semibold tabular-nums">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
              <Icon className="size-4" strokeWidth={1.6} aria-hidden="true" />
            </span>
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
