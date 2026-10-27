import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import type { CareAction } from "@/lib/careos/contracts";
import { Button } from "../ui/button";

export function AnswerActions({
  actions,
  onNavigate,
}: {
  actions: CareAction[];
  onNavigate: () => void;
}) {
  if (!actions.length) return null;
  const primary =
    actions.find((action) => action.label === "Open receipt") ?? actions[0];
  const secondary = actions.filter((action) => action !== primary);
  return (
    <div className="space-y-2">
      <Button
        asChild
        className="w-full justify-between whitespace-normal text-left"
      >
        <Link href={primary.href} onClick={onNavigate}>
          {primary.label}
          <ArrowUpRight aria-hidden="true" />
        </Link>
      </Button>
      {!!secondary.length && (
        <details className="text-sm">
          <summary className="min-h-11 cursor-pointer py-2 font-medium text-primary">
            More options
          </summary>
          <ul className="space-y-1 pb-2">
            {secondary.map((action) => (
              <li key={`${action.href}:${action.label}`}>
                <Link
                  className="flex min-h-11 items-center justify-between gap-3 rounded-lg px-2 py-2 text-primary underline underline-offset-4 hover:bg-accent"
                  href={action.href}
                  onClick={onNavigate}
                >
                  {action.label}
                  <ArrowUpRight
                    className="size-4 shrink-0"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
