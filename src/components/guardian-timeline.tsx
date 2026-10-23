import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import type { GuardianView } from "@/lib/price-guardian/contracts";

export function GuardianTimeline({ item }: { item: GuardianView }) {
  return (
    <ol className="mt-4 space-y-3" aria-label="Price Guardian event history">
      {item.history.map((e) => (
        <li key={e.id}>
          <Card className="rounded-2xl">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold">
                {e.kind.replaceAll(".", " · ")}
              </p>
              <Badge
                tone={
                  e.kind === "refund.completed" && item.verifiedAt
                    ? "success"
                    : "neutral"
                }
              >
                {e.kind === "refund.completed" && item.verifiedAt
                  ? "Verified Sandbox refund"
                  : "Recorded merchant workflow"}
              </Badge>
            </div>
            <p className="mt-3 text-sm leading-7 text-muted-foreground">
              {e.detail}
            </p>
            <time
              className="mt-3 block text-xs text-muted-foreground"
              dateTime={e.at}
            >
              {e.at}
            </time>
          </Card>
        </li>
      ))}
    </ol>
  );
}
