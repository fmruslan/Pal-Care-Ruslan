/** Presentation-only destinations shared by desktop and mobile navigation. */
export const customerNavigation = [
  { href: "/dashboard", label: "Care" },
  { href: "/purchases", label: "Purchases" },
  { href: "/insights", label: "Insights" },
  { href: "/documents", label: "Documents" },
] as const;

export const customerExploreNavigation = [
  {
    href: "/shop",
    label: "Demo shop",
    description:
      "Browse fictional products. Sandbox checkout has separate availability and approval limits.",
  },
  {
    href: "/guardian",
    label: "Price adjustment review",
    description:
      "Review recorded eligibility and outcomes. A proposal is not a refund.",
  },
  {
    href: "/safety",
    label: "Safety information",
    description:
      "Limited saved notice evidence, not comprehensive recall monitoring or an all-clear.",
  },
  {
    href: "/replacements",
    label: "Replacement ideas",
    description: "Fixture examples, not live offers or purchasing advice.",
  },
] as const;

export function customerSection(path: string) {
  const [pathname, search = ""] = path.split("?");
  if (/^\/care(\/|$)/.test(pathname)) return customerNavigation[0];
  if (/^\/documents(\/|$)/.test(pathname)) return customerNavigation[3];
  if (
    pathname === "/purchases" &&
    new URLSearchParams(search).getAll("view").join() === "documents"
  )
    return customerNavigation[3];
  if (/^\/vault(\/|$)/.test(pathname)) return customerNavigation[1];
  return customerNavigation.find(
    ({ href }) => pathname === href || pathname.startsWith(`${href}/`),
  );
}
