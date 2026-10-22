import Link from "next/link";

export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link
      href={href}
      aria-label="Pal Care home"
      className="inline-flex shrink-0 items-center gap-2.5 font-semibold tracking-tight text-foreground"
    >
      <span className="flex size-10 items-center justify-center rounded-[14px] bg-primary text-primary-foreground shadow-card">
        <svg
          viewBox="0 0 28 28"
          fill="none"
          className="size-7"
          aria-hidden="true"
        >
          <path
            d="M7 22V10a6 6 0 0 1 12 0v3a5 5 0 0 1-5 5h-3"
            stroke="currentColor"
            strokeWidth="2.8"
            strokeLinecap="round"
          />
          <path
            d="M12 21h3a6 6 0 0 0 6-6v-5"
            stroke="var(--lavender)"
            strokeWidth="2.8"
            strokeLinecap="round"
          />
        </svg>
      </span>
      <span className="text-xl">
        pal care<span className="text-brand">.</span>
      </span>
    </Link>
  );
}
