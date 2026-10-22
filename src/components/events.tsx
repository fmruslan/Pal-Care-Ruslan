import Link from "next/link";
import {
  ArrowUpRight,
  CircleDollarSign,
  FileHeart,
  ShoppingBag,
  CalendarDays,
} from "lucide-react";
import type { CareEvent } from "@/db/schema";
import { displayDate } from "@/lib/demo/presentation";
import { Badge } from "./ui/badge";
import { Card } from "./ui/card";

export function Events({ events }: { events: CareEvent[] }) {
  const icons = {
    price: CircleDollarSign,
    care: FileHeart,
    return: CalendarDays,
    purchase: ShoppingBag,
  };
  return (
    <Card className="divide-y px-5 py-0 sm:px-6">
      {events.length ? (
        events.map((event) => {
          const Icon = icons[event.kind as keyof typeof icons] ?? FileHeart;
          return (
            <div key={event.id} className="relative flex gap-4 py-6">
              <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary">
                <Icon className="size-5 text-primary" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">{event.title}</h3>
                  <Badge
                    tone={event.origin === "sandbox" ? "success" : "neutral"}
                  >
                    {event.origin === "sandbox" ? "Verified sandbox" : "Sample"}
                  </Badge>
                </div>
                <p className="mt-3 text-sm leading-7 text-muted-foreground">
                  {event.description}
                </p>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <time
                    dateTime={event.occurredOn}
                    className="text-xs text-muted-foreground"
                  >
                    {displayDate(event.occurredOn)}
                  </time>
                  <Link
                    href={`/vault/${event.twinId}`}
                    className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary"
                  >
                    View Purchase Twin
                    <ArrowUpRight className="size-4" aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </div>
          );
        })
      ) : (
        <p className="py-6 text-sm text-muted-foreground">
          No care events yet.
        </p>
      )}
    </Card>
  );
}
