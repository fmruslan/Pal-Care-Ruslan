/** Presentation-only destinations shared by desktop and mobile navigation. */
export const customerNavigation = [
  { href: "/dashboard", label: "Home" },
  { href: "/vault", label: "Purchases" },
  { href: "/insights", label: "Insights" },
  { href: "/documents", label: "Documents" },
] as const;

export const customerExploreNavigation = [
  { href: "/shop", label: "Demo shop" },
  { href: "/guardian", label: "Price Guardian" },
  { href: "/safety", label: "Safety & recalls" },
  { href: "/replacements", label: "Replacements" },
] as const;

export function customerSection(path: string) {
  return customerNavigation.find(
    ({ href }) => path === href || path.startsWith(`${href}/`),
  );
}
