import Link from "next/link";
import type { PurchaseActivity as Activity } from "@/lib/careos/activity";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";
import { displayDate } from "@/lib/demo/presentation";
export function PurchaseActivity({ activity }: { activity: Activity }) {
  return (
    <div>
      {!!activity.unavailable.length && (
        <p role="status" className="mb-4 text-sm text-warning">
          Some history is unavailable: {activity.unavailable.join(", ")}.
          Missing records do not confirm that there are no issues.
        </p>
      )}
      <ol aria-label="Purchase activity" className="space-y-3">
        {activity.items.slice(0, 30).map((item) => (
          <li key={item.id}>
            <Card>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">{item.title}</h3>
                <Badge tone={item.verified ? "success" : "neutral"}>
                  {item.verified
                    ? "Verified Sandbox"
                    : "Saved record · see source"}
                </Badge>
              </div>
              <p className="mt-3 text-sm leading-7 text-muted-foreground">
                {item.detail}
              </p>
              <time
                className="mt-2 block text-xs text-muted-foreground"
                dateTime={item.at}
              >
                {displayDate(item.at)}
              </time>
              <Link
                className="mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-primary"
                href={item.href}
              >
                View source →
              </Link>
              <details className="text-xs text-muted-foreground">
                <summary className="min-h-11 cursor-pointer py-3">
                  View source details
                </summary>
                {item.provenance}
              </details>
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
          Showing the latest 30 updates. Open a source for more detail.
        </p>
      )}
    </div>
  );
}
