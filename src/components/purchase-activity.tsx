import Link from "next/link";
import type { PurchaseActivity as Activity } from "@/lib/careos/activity";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";
export function PurchaseActivity({ activity }: { activity: Activity }) {
  return (
    <div>
      {!!activity.unavailable.length && (
        <p role="status" className="mb-4 text-sm text-warning">
          Partial activity: {activity.unavailable.join(", ")} unavailable.
          Missing evidence is not an all-clear.
        </p>
      )}
      <ol aria-label="Unified purchase activity" className="space-y-3">
        {activity.items.slice(0, 30).map((item) => (
          <li key={item.id}>
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">{item.title}</h3>
                <Badge tone={item.verified ? "success" : "neutral"}>
                  {item.verified ? "Verified Sandbox" : "Source-labeled record"}
                </Badge>
              </div>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                {item.detail}
              </p>
              <p className="mt-3 break-words text-xs text-muted-foreground">
                {item.provenance}
              </p>
              <time
                className="mt-2 block text-xs text-muted-foreground"
                dateTime={item.at}
              >
                {item.at}
              </time>
              <Link
                className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-primary"
                href={item.href}
              >
                Inspect activity evidence →
              </Link>
            </Card>
          </li>
        ))}
      </ol>
      {!activity.items.length && (
        <p className="text-sm text-muted-foreground">
          No activity in the available records.
        </p>
      )}
      {activity.items.length > 30 && (
        <p className="mt-3 text-xs text-muted-foreground">
          Showing the newest 30 activity records; source timelines retain their
          own evidence.
        </p>
      )}
    </div>
  );
}
