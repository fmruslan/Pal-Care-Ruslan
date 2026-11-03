"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentProps } from "react";
import { useWorkspaceDeparture } from "./customer-control";

/** An accepted client navigation releases native initialization before the new
 * route transition. Modified/external clicks are left to Next's link semantics;
 * no reload, model call, history reset or timing heuristic is introduced. */
export function WorkspaceNavigationLink(
  props: Omit<ComponentProps<typeof Link>, "onNavigate"> & { href: string },
) {
  const pathname = usePathname();
  const prepareDeparture = useWorkspaceDeparture();
  return (
    <Link
      {...props}
      onNavigate={() => {
        if (props.href !== pathname) prepareDeparture?.();
      }}
    />
  );
}
