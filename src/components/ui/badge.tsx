import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type Tone =
  "neutral" | "blue" | "intelligence" | "success" | "warning" | "danger";
const tones: Record<Tone, string> = {
  neutral: "bg-neutral text-muted-foreground",
  blue: "bg-secondary text-secondary-foreground",
  intelligence: "bg-intelligence text-intelligence-foreground",
  success: "bg-success-surface text-success",
  warning: "bg-warning-surface text-warning",
  danger: "bg-danger-surface text-danger",
};
export function Badge({
  tone = "neutral",
  className,
  ...props
}: ComponentProps<"span"> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium leading-5",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
