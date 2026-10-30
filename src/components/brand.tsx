import Link from "next/link";
import Image from "next/image";

export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link
      href={href}
      aria-label="Pal Care home"
      className="inline-flex shrink-0 items-center gap-2.5 font-semibold tracking-tight text-foreground"
    >
      <Image
        src="/icon.svg"
        width={44}
        height={44}
        alt=""
        unoptimized
        aria-hidden="true"
      />
      <span className="text-xl font-bold">Pal Care</span>
    </Link>
  );
}
