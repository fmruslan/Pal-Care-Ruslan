import Link from "next/link";
import { HeartHandshake } from "lucide-react";

export function Brand({
  href = "/",
  light = false,
}: {
  href?: string;
  light?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-label="Pal Care home"
      className={`inline-flex items-center gap-2.5 font-semibold tracking-tight ${light ? "text-white" : "text-foreground"}`}
    >
      <span
        className={`flex size-10 items-center justify-center rounded-2xl ${light ? "bg-white/15" : "bg-primary text-primary-foreground"}`}
      >
        <HeartHandshake className="size-6" aria-hidden="true" />
      </span>
      <span className="text-xl">
        pal care<span className="text-coral">.</span>
      </span>
    </Link>
  );
}
