import type { ReactNode } from "react";
import { Brand } from "./brand";
import { ThemeSelector } from "./theme-selector";

export function StandaloneShell({
  children,
  href = "/dashboard",
}: {
  children: ReactNode;
  href?: string;
}) {
  return (
    <div className="mx-auto max-w-2xl px-5 py-6 sm:py-10">
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <Brand href={href} />
        <ThemeSelector />
      </header>
      <main id="main-content">{children}</main>
      <footer className="mt-7 text-sm leading-7 text-muted-foreground">
        Pal Care · Independent Sandbox demo. Fictional products and customer. No
        real money or coverage promise.
      </footer>
    </div>
  );
}
