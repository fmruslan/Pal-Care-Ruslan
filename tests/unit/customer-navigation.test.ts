import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Landing from "../../src/app/about/page";
import Home from "../../src/app/page";
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
      label:
        attributes.match(/aria-label="([^"]*)"/)?.[1] ??
        textContent(content.match(/^<span>([\s\S]*?)<\/span>/)?.[1] ?? content),
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
  it("combines purchases and documents in one primary destination", () => {
    expect(customerNavigation).toEqual([
      { href: "/dashboard", label: "Care" },
      { href: "/purchases", label: "Purchases & Docs" },
      { href: "/insights", label: "Insights" },
    ]);
  });

  it("renders the same destinations and selected page on desktop and mobile", () => {
    const markup = renderShell("/insights");
    for (const region of ["Main navigation"]) {
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
      expect(customerSection(path)?.href).toBe("/purchases");
    expect(customerSection("/documents/document-id")?.href).toBe("/purchases");
    expect(customerSection("/insights/detail")?.href).toBe("/insights");
    for (const path of [
      "/vaulted",
      "/documents-extra",
      "/insights-extra",
      "/merchant",
    ])
      expect(customerSection(path)).toBeUndefined();
    for (const region of ["Main navigation"])
      expect(
        navigationLinks(renderShell("/documents/document-id"), region)
          .filter(({ current }) => current)
          .map(({ href }) => href),
      ).toEqual(["/purchases"]);
  });

  it("selects the combined tab for direct and legacy document routes, including searches", () => {
    for (const path of [
      "/documents",
      "/documents?q=receipt",
      "/purchases?view=documents",
      "/purchases?q=receipt&view=documents&page=2",
    ]) {
      expect(customerSection(path)?.href).toBe("/purchases");
      expect(
        navigationLinks(renderShell(path), "Main navigation")
          .filter(({ current }) => current)
          .map(({ href }) => href),
      ).toEqual(["/purchases"]);
    }
    for (const path of [
      "/purchases?q=documents",
      "/purchases?view=purchases",
      "/purchases?view=documents&view=purchases",
    ])
      expect(customerSection(path)?.href).toBe("/purchases");
  });

  it("removes the primary tools menu and places secondary routes in Care", () => {
    const markup = renderShell();
    expect(markup).not.toContain("More tools");
    expect(customerExploreNavigation.map(({ href }) => href)).toEqual([
      "/shop",
      "/guardian",
      "/safety",
      "/replacements",
    ]);
    expect(customerExploreNavigation.map(({ label }) => label)).toEqual([
      "Browse products",
      "Price adjustment review",
      "Safety information",
      "Replacement ideas",
    ]);
    for (const { href } of customerExploreNavigation) {
      expect(customerSection(href)?.href).toBe("/dashboard");
      expect(
        navigationLinks(renderShell(href), "Main navigation")
          .filter((l) => l.current)
          .map((l) => l.href),
      ).toEqual(["/dashboard"]);
    }
  });

  it("keeps sample and Sandbox provenance in the purchase disclosure and links About", () => {
    const markup = renderShell();
    const disclosure = markup.match(
      /<details\b[^>]*class="demo-details"[^>]*>([\s\S]*?)<\/details>/,
    )![1];
    const text = textContent(disclosure);
    expect(text).toContain("Example purchases & PayPal Sandbox");
    expect(text).toContain("fictional example purchases");
    expect(text).toContain("verified PayPal Sandbox purchases");
    expect(text).toContain("Sandbox payments use no real money");
    expect(text).toContain(
      "a payment does not confirm delivery, warranty coverage or product safety",
    );
    expect(text).toContain(
      "Raspberry Pi 5 has a sample ownership record, not a verified purchase",
    );
    expect(markup).toMatch(/<a\b[^>]*href="\/about"[^>]*>About Pal Care<\/a>/);
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
    expect(text).toContain("Example purchases are fictional");
    expect(text).toContain("AI features require an authorized connection");
    expect(text).not.toContain("AI and monitoring are not active yet");
  });
  it("opens Care rather than the marketing page by default", () => {
    expect(() => Home()).toThrow("NEXT_REDIRECT");
  });
});
