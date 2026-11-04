/** Presentation-only destinations shared by desktop and mobile navigation. */
export const customerNavigation = [
  { href: "/dashboard", label: "Care" },
  { href: "/purchases", label: "Purchases" },
  { href: "/insights", label: "Insights" },
] as const;

export const customerExploreNavigation = [
  { href: "/shop", label: "Demo shop" },
  { href: "/guardian", label: "Price Guardian" },
  { href: "/safety", label: "Safety & recalls" },
  { href: "/replacements", label: "Replacements" },
] as const;

export function customerSection(path: string) {
  if (/^\/care(\/|$)/.test(path)) return customerNavigation[0];
  if (/^\/(vault|documents)(\/|$)/.test(path)) return customerNavigation[1];
  return customerNavigation.find(
    ({ href }) => path === href || path.startsWith(`${href}/`),
  );
}
