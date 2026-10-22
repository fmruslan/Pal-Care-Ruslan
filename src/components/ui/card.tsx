import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="card"
      className={cn(
        "rounded-3xl border border-border bg-card p-6 shadow-[0_3px_16px_-12px_#253b36]",
        className,
      )}
      {...props}
    />
  );
}
