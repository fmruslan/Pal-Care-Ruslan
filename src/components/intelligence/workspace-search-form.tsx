"use client";

import Form from "next/form";
import type { ComponentProps } from "react";
import { useWorkspaceDeparture } from "./customer-control";

/** GET navigation keeps the root North host alive; it never submits a turn. */
export function WorkspaceSearchForm(
  props: Omit<ComponentProps<typeof Form>, "onSubmit" | "action">,
) {
  const departure = useWorkspaceDeparture();
  return <Form {...props} action="/purchases" onSubmit={() => departure?.()} />;
}
