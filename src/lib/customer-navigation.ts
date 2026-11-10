/** Presentation-only destinations shared by desktop and mobile navigation. */
export const customerNavigation = [
  { href: "/dashboard", label: "Care" },
  { href: "/purchases", label: "Purchases & Docs" },
  { href: "/insights", label: "Insights" },
] as const;

export const customerExploreNavigation = [
  {
    href: "/shop",
    label: "Browse products",
    description:
      "Explore example products. PayPal Sandbox checkout is available only when enabled.",
  },
  {
    href: "/guardian",
    label: "Price adjustment review",
    description:
      "See saved price-adjustment requests and confirmed outcomes. A request is not a refund.",
  },
  {
    href: "/safety",
    label: "Safety information",
    description:
      "Read available safety notices and check which product details still need confirmation. Not comprehensive recall monitoring.",
  },
  {
    href: "/replacements",
    label: "Replacement ideas",
    description:
      "Compare example alternatives. These are not current prices or live offers.",
  },
] as const;

export function customerSection(path: string) {
  const [pathname] = path.split("?");
  if (/^\/care(\/|$)/.test(pathname)) return customerNavigation[0];
  if (/^\/documents(\/|$)/.test(pathname)) return customerNavigation[1];
  if (/^\/vault(\/|$)/.test(pathname)) return customerNavigation[1];
  return customerNavigation.find(
    ({ href }) => pathname === href || pathname.startsWith(`${href}/`),
  );
}
