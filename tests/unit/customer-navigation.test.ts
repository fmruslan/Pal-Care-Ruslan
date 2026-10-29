import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Landing from "../../src/app/page";
import { Shell } from "../../src/components/shell";
import {
  customerExploreNavigation,
  customerNavigation,
  customerSection,
} from "../../src/lib/customer-navigation";

function textContent(markup: string) {
  return markup
    .replace(/<svg\b[\s\S]*?<\/svg>/g, "")
    .replace(/<[^>]*>/g, "")
    .replaceAll("&amp;", "&")
    .replace(/\s+/g, " ")
    .trim();
}

function navigationLinks(markup: string, name: string) {
  const nav = markup.match(
    new RegExp(`<nav\\b[^>]*aria-label="${name}"[^>]*>([\\s\\S]*?)</nav>`),
  );
  expect(nav, `Navigation region: ${name}`).not.toBeNull();
  return [...nav![1].matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map(
    ([, attributes, content]) => ({
      href: attributes.match(/href="([^"]*)"/)?.[1],
      label: textContent(content),
      current: attributes.includes('aria-current="page"'),
    }),
  );
}

function renderShell(active = "/dashboard", merchant = false) {
  const props = {
    active,
    merchant,
    source: "fixtures" as const,
    children: createElement("p", null, "Saved purchase records"),
  };
  return renderToStaticMarkup(createElement(Shell, props));
}

describe("customer navigation contract", () => {
  it("has exactly Home, Purchases, Insights and Documents in that order", () => {
    expect(customerNavigation).toEqual([
      { href: "/dashboard", label: "Home" },
      { href: "/vault", label: "Purchases" },
      { href: "/insights", label: "Insights" },
      { href: "/documents", label: "Documents" },
    ]);
  });

  it("renders the same destinations and selected page on desktop and mobile", () => {
    const markup = renderShell("/insights");
    for (const region of ["Main navigation", "Mobile navigation"]) {
      const links = navigationLinks(markup, region);
      expect(links.map(({ href, label }) => ({ href, label }))).toEqual(
        customerNavigation,
      );
      expect(
        links.filter(({ current }) => current).map(({ href }) => href),
      ).toEqual(["/insights"]);
    }
  });

  it("keeps nested pages in their section without matching unrelated prefixes", () => {
    for (const path of ["/vault/purchase-id", "/vault/purchase-id/care"])
      expect(customerSection(path)?.href).toBe("/vault");
    expect(customerSection("/documents/document-id")?.href).toBe("/documents");
    expect(customerSection("/insights/detail")?.href).toBe("/insights");
    for (const path of ["/vaulted", "/insights-extra", "/shop", "/merchant"])
      expect(customerSection(path)).toBeUndefined();
    for (const region of ["Main navigation", "Mobile navigation"])
      expect(
        navigationLinks(renderShell("/documents/document-id"), region)
          .filter(({ current }) => current)
          .map(({ href }) => href),
      ).toEqual(["/documents"]);
  });

  it("keeps secondary destinations behind a native keyboard-accessible disclosure", () => {
    const markup = renderShell();
    expect(markup).toMatch(/<details\b[^>]*><summary\b[^>]*>Explore/);
    expect(
      navigationLinks(markup, "More to explore").map(({ href, label }) => ({
        href,
        label,
      })),
    ).toEqual(customerExploreNavigation);
    expect(customerExploreNavigation.map(({ href }) => href)).toEqual([
      "/shop",
      "/guardian",
      "/safety",
      "/replacements",
    ]);
  });

  it("removes customer-to-merchant switches without removing merchant navigation", () => {
    const customer = renderShell();
    expect(customer).not.toContain('href="/merchant');
    expect(textContent(customer)).not.toMatch(/Merchant (view|workspace)/);
    const merchant = renderShell("/merchant/intelligence", true);
    expect(
      navigationLinks(merchant, "Mobile navigation").map(({ href, label }) => ({
        href,
        label,
      })),
    ).toEqual([
      { href: "/merchant", label: "Merchant" },
      { href: "/merchant/intelligence", label: "Intelligence" },
    ]);
    expect(merchant).toContain("Customer view");
  });

  it("introduces read-only Insights without claiming all AI is unavailable", () => {
    const landing = renderToStaticMarkup(createElement(Landing));
    expect(landing).not.toContain('href="/merchant');
    const text = textContent(landing);
    expect(text).not.toContain("For merchants");
    expect(landing).toContain('href="/insights"');
    expect(text).toContain("Insights is read-only");
    expect(text).toContain("fixture answers are labeled demonstrations");
    expect(text).toContain(
      "real AI is available only in the authorized private preview",
    );
    expect(text).not.toContain("AI and monitoring are not active yet");
  });
});
