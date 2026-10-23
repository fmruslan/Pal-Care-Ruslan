import Link from "next/link";
import { Card } from "../ui/card";
import { Badge } from "../ui/badge";
import { money } from "@/lib/demo/presentation";
import {
  totals,
  stages,
  type IntelligenceFact,
} from "@/lib/intelligence/model";

export function ValueRecovery({
  facts,
  example = false,
}: {
  facts: IntelligenceFact[];
  example?: boolean;
}) {
  const values = totals(facts);
  return (
    <div className="p-5">
      <p className="text-xs font-semibold tracking-widest text-intelligence-foreground uppercase">
        Value recovery
      </p>
      <p className="mt-2 text-4xl font-semibold tracking-tight tabular-nums">
        {money(values.Verified)}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        {example
          ? "Illustrative completed amount · not a real refund"
          : "Independently verified Sandbox refunds"}
      </p>
      <dl className="mt-5 grid grid-cols-2 gap-4">
        {stages
          .filter((s) => s !== "Verified")
          .map((s) => (
            <div key={s}>
              <dt className="text-xs text-muted-foreground">{s}</dt>
              <dd className="mt-1 text-base font-semibold tabular-nums">
                {money(values[s])}
              </dd>
            </div>
          ))}
      </dl>
    </div>
  );
}
export function AdjustmentStatus({
  facts,
  onStage,
}: {
  facts: IntelligenceFact[];
  onStage?: (s: string) => void;
}) {
  return (
    <div className="p-5">
      <p className="text-xs font-semibold tracking-widest text-intelligence-foreground uppercase">
        Adjustment status
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        One case, one outcome. Select a stage to investigate.
      </p>
      <div className="mt-5 space-y-2">
        {stages.map((stage) => {
          const count = facts.filter((f) => f.stage === stage).length;
          return (
            <button
              key={stage}
              type="button"
              onClick={() => onStage?.(stage)}
              disabled={!onStage}
              className="flex min-h-11 w-full items-center gap-3 rounded-xl border px-3 text-left text-sm hover:bg-secondary disabled:cursor-default"
            >
              <span className="w-22 shrink-0 font-medium">{stage}</span>
              <span className="h-2 flex-1 rounded-full bg-neutral">
                <span
                  className="block h-2 rounded-full bg-primary"
                  style={{
                    width: `${facts.length ? (count / facts.length) * 100 : 0}%`,
                  }}
                />
              </span>
              <span className="w-5 text-right tabular-nums">{count}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
export function EvidenceFreshness({
  facts,
  example = false,
}: {
  facts: IntelligenceFact[];
  example?: boolean;
}) {
  return (
    <div className="p-5">
      <p className="text-xs font-semibold tracking-widest text-intelligence-foreground uppercase">
        Evidence & freshness
      </p>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {example
          ? "Fictional records for exploring this workspace. Never included in stored financial totals."
          : "Saved observations, not a live provider query. Unknown is never counted as verified."}
      </p>
      <ul className="mt-4 space-y-3">
        {facts.slice(0, 4).map((f) => (
          <li key={f.id} className="rounded-xl border p-3">
            <p className="text-sm font-semibold">{f.product}</p>
            <Badge className="mt-2">{f.evidence}</Badge>
            <p className="mt-2 break-words text-xs text-muted-foreground">
              {f.checkedAt}
            </p>
            {f.href && (
              <Link
                href={f.href}
                className="mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-primary"
              >
                Inspect case evidence →
              </Link>
            )}
          </li>
        ))}
      </ul>
      {!facts.length && (
        <p className="mt-4 text-sm">No cases in this selection.</p>
      )}
    </div>
  );
}
export function IntelligenceSummary({
  facts,
  example,
  onStage,
}: {
  facts: IntelligenceFact[];
  example: boolean;
  onStage?: (s: string) => void;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <Card className="intelligence-wash p-0">
        <ValueRecovery facts={facts} example={example} />
      </Card>
      <Card className="p-0">
        <AdjustmentStatus facts={facts} onStage={onStage} />
      </Card>
      <Card className="p-0">
        <EvidenceFreshness facts={facts} example={example} />
      </Card>
    </div>
  );
}
