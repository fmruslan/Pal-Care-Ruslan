import Link from "next/link";
import { ShieldAlert, ArrowUpRight } from "lucide-react";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import type { RecallDecision } from "@/lib/safety/matching";
export function SafetyCard({
  decision,
  example = false,
  twinId,
}: {
  decision: RecallDecision;
  example?: boolean;
  twinId?: string;
}) {
  return (
    <Card>
      <p className="flex items-center gap-2 text-sm font-semibold text-intelligence-foreground">
        <ShieldAlert className="size-5" aria-hidden="true" />
        Recall Guardian
      </p>
      <h2 className="mt-3 text-xl font-semibold">
        {decision.state === "possible_match"
          ? "A notice worth checking."
          : decision.state === "identifiers_match"
            ? "Identifiers match an official notice."
            : "Safety evidence, clearly scoped."}
      </h2>
      <Badge
        className="mt-3"
        tone={decision.state === "possible_match" ? "warning" : "neutral"}
      >
        {example
          ? "Fictional ownership · real official notice"
          : decision.state.replaceAll("_", " ")}
      </Badge>
      <p className="mt-3 text-sm leading-7 text-muted-foreground">
        {decision.reason}
      </p>
      <Link
        href={
          example
            ? "/safety?example=insignia"
            : twinId
              ? `/safety?twinId=${twinId}`
              : "/safety"
        }
        className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary"
      >
        Inspect official recall evidence
        <ArrowUpRight className="size-4" aria-hidden="true" />
      </Link>
    </Card>
  );
}
