import { WorkspaceNavigationLink as Link } from "./intelligence/workspace-navigation-link";
import Image from "next/image";

export function Brand({ href = "/" }: { href?: string }) {
  return (
    <Link
      href={href}
      aria-label="Pal Care home"
      className="palcare-brand inline-flex min-h-11 shrink-0 items-center gap-2.5 font-semibold tracking-tight text-foreground"
    >
      <Image
        src="/icon.svg"
        width={36}
        height={36}
        alt=""
        unoptimized
        aria-hidden="true"
      />
      <span className="text-xl font-semibold">Pal Care</span>
    </Link>
  );
}
