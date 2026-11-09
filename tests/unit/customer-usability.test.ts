import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  OwnershipScope,
  OwnershipTimeline,
  OwnershipSummary,
} from "../../src/components/care/ownership";
import { CareFeedView } from "../../src/components/care/feed";
import { NorthSearch } from "../../src/components/careos/integrated";
import { careFeed } from "../../src/lib/care/model";
import {
  withTenProductFixtures,
  demoId,
} from "../../src/lib/care/demo/catalog";
import { demoData } from "../../src/lib/demo/fixtures";
import { emptyOverview } from "../../src/lib/price-guardian/projections";
import { parseLibraryQuery } from "../../src/lib/library-navigation";

vi.mock("next/navigation", async (original) => ({
  ...(await original<typeof import("next/navigation")>()),
  usePathname: () => "/purchases",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

function feed(tenProducts = false) {
  return careFeed({
    data: tenProducts
      ? withTenProductFixtures(structuredClone(demoData))
      : demoData,
    knowledge: [],
    guardian: emptyOverview(),
    activity: { items: [], unavailable: [] },
    now: new Date("2026-11-05T12:00:00Z"),
  });
}

describe("customer usability presentation", () => {
  it("names Ask North visibly while preserving its accessible Ask North Star control", () => {
    const markup = renderToStaticMarkup(
      createElement(NorthSearch, {
        query: parseLibraryQuery({}),
        searchIndex: ["headphones receipt"],
      }),
    );
    expect(markup).toMatch(
      /aria-label="Ask North Star"[\s\S]*?<span>Ask North<\/span>/,
    );
    expect(markup).toContain('aria-label="Search"');
    expect(markup).toContain('aria-label="Search or ask North"');
    expect(markup).toContain("History");
  });

  it("keeps known milestones in the main timeline and gaps in a closed accessible disclosure", () => {
    const view = feed().ownership.find((v) => v.twinId === demoId(201))!;
    const scopeProps = { view, children: createElement(OwnershipTimeline) };
    const markup = renderToStaticMarkup(
      createElement(OwnershipScope, scopeProps),
    );
    const main = markup.match(
      /aria-label="Ownership milestones"[^>]*>([\s\S]*?)<\/ol>/,
    )![1];
    expect(main).toContain('data-ownership-milestone="purchase"');
    const gaps = markup.match(
      /<details\b([^>]*data-ownership-unknowns[^>]*)>([\s\S]*?)<\/details>/,
    )!;
    expect(gaps).not.toBeNull();
    expect(gaps[1]).not.toMatch(/\bopen(?:=|\s|$)/);
    expect(gaps[2]).toContain("Missing evidence is not an all-clear");
    for (const fact of view.facts.filter((f) =>
      ["unknown", "unavailable", "not-applicable"].includes(f.state),
    )) {
      expect(main).not.toContain(`data-ownership-milestone="${fact.topic}"`);
      expect(gaps[2]).toContain(`data-ownership-milestone="${fact.topic}"`);
      expect(gaps[2]).toContain(fact.status.replaceAll("&", "&amp;"));
      for (const source of fact.sources) expect(markup).toContain(source.href);
    }
    expect(markup).toContain("Expand dates, sources &amp; actions");
  });

  it("leaves Care gaps to the full evidence/details view rather than adding another row of unknown controls", () => {
    const view = feed().ownership.find((v) => v.twinId === demoId(201))!;
    const scopeProps = {
      view,
      surface: "care" as const,
      children: createElement(OwnershipSummary, {
        topic: "purchase",
        secondary: true,
      }),
    };
    const markup = renderToStaticMarkup(
      createElement(OwnershipScope, scopeProps),
    );
    const rail = markup.match(/<ol\b[^>]*>([\s\S]*?)<\/ol>/)![1];
    expect(rail).toContain('data-care-milestone="purchase"');
    expect(rail).not.toContain('data-care-milestone="delivery"');
    expect(markup).not.toContain('data-care-milestone="delivery"');
    expect(markup).not.toContain("Other milestones");
    // The same view retains the unknown fact for the full Details disclosure
    // and the pill's All ownership states panel; it is not deleted.
    expect(view.facts.some((fact) => fact.topic === "delivery")).toBe(true);
  });

  it("links the exact second receipt directly without lending it the Sample purchase's care claims", () => {
    const projected = feed(true);
    const sample = projected.purchases.find((p) => p.id === demoId(201))!;
    // Presentation-only double, never saved or treated as actual provider evidence.
    const second = {
      ...sample,
      id: demoId(290),
      origin: "sandbox" as const,
      purchasedOn: "2026-10-22",
      amountMinor: 12900,
      href: `/vault/${demoId(290)}`,
      receiptHref: `/documents/${demoId(390)}`,
    };
    projected.purchases.push(second);
    projected.protections.push({
      ...projected.protections.find((p) => p.twinId === sample.id)!,
      twinId: second.id,
    });
    const markup = renderToStaticMarkup(
      createElement(CareFeedView, { feed: projected }),
    );
    const direct = markup.match(
      new RegExp(
        `<a\\b[^>]*data-care-direct-receipt="${second.id}"[^>]*>[\\s\\S]*?<\\/a>`,
      ),
    )![0];
    expect(direct).toContain(`href="${second.receiptHref}"`);
    expect(direct).toContain("Verified Sandbox");
    expect(direct).toContain("$129.00");
    expect(direct).toContain("Oct 22, 2026");
    expect(markup).toContain("Care shown: Sample");
    expect(markup).toContain("$149.00");
    expect(markup).toContain("Oct 18, 2026");
    expect(markup).toContain("Each purchase keeps its own sources and history");
    expect(markup).toContain(`data-care-history-purchase="${sample.id}"`);
    expect(markup).toContain(`data-care-history-purchase="${second.id}"`);
    expect(markup).toContain(`href="${sample.receiptHref}"`);
  });
});
