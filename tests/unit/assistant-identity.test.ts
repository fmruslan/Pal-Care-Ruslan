import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AssistantName } from "../../src/components/assistant-name";
import { CareOSPanel } from "../../src/components/careos-panel";
import {
  ASSISTANT_NAME,
  ASSISTANT_SPOKEN_NAME,
  assistantSuggestions,
} from "../../src/lib/assistant-identity";
import { CAREOS_ROLE, IDENTITY_TEXT } from "../../src/lib/careos/role";

describe("North display identity, with Pal Care remaining the product", () => {
  it("centralizes the literal outlined-star name and its single spoken equivalent", () => {
    expect(ASSISTANT_NAME).toBe("North ☆");
    expect(ASSISTANT_SPOKEN_NAME).toBe("North Star");
    const markup = renderToStaticMarkup(createElement(AssistantName));
    expect(markup).toMatch(/aria-hidden="true"[^>]*>North<\/span>/);
    expect(markup).toMatch(/class="sr-only">North Star<\/span>/);
    const stars = markup.match(/<svg\b[^>]*>[\s\S]*?<\/svg>/g) ?? [];
    expect(stars).toHaveLength(1);
    expect(stars[0]).toContain('aria-hidden="true"');
    expect(stars[0]).toContain('fill="none"');
    expect(stars[0]).toMatch(/<(?:path|polygon)\b/);
    expect(stars[0]).not.toMatch(
      /sparkles|<title|<text|<image|(?:href|src)="https?:/,
    );
    expect(markup.match(/North Star/g)).toHaveLength(1);
    expect(markup).not.toMatch(/Powered by|CareOS|★|✨/i);
  });

  it("retains exactly the four approved optional discovery questions", () => {
    expect(assistantSuggestions).toEqual([
      "What did I buy in the last three months?",
      "Show my recorded purchase totals.",
      "Find purchases with receipts.",
      "Help me care for a product.",
    ]);
  });

  it.each([false, true])(
    "renders current assistant copy without powered attribution, compact=%s",
    (compact) => {
      const markup = renderToStaticMarkup(
        createElement(CareOSPanel, { compact }),
      );
      expect(markup).toContain("North Star");
      expect(markup).not.toMatch(/powered\s+by|CareOS/i);
      if (!compact) {
        expect(markup).toContain("Pal Care");
        expect(markup).toContain("no live AI inference is claimed");
      }
    },
  );

  it("introduces the new assistant as part of Pal Care without granting financial or account authority", () => {
    expect(IDENTITY_TEXT).toContain(
      "I’m North Star, Pal Care’s purchase assistant",
    );
    expect(IDENTITY_TEXT).toContain("not an official PayPal service");
    expect(CAREOS_ROLE).toContain("You are North Star");
    expect(CAREOS_ROLE).toContain("formerly CareOS");
    expect(CAREOS_ROLE).toContain("not a separate product");
    expect(CAREOS_ROLE).toContain("authority to move money");
    expect(CAREOS_ROLE).toContain(
      "never treat a selected product's price as a library total",
    );
    expect(IDENTITY_TEXT).not.toMatch(/powered\s+by/i);
  });

  it.each([
    "../../src/components/shell.tsx",
    "../../src/components/careos/provider.tsx",
    "../../src/components/careos-panel.tsx",
    "../../src/app/page.tsx",
    "../../src/app/layout.tsx",
  ])(
    "does not reintroduce assistant powered attribution in current product surfaces: %s",
    (path) => {
      const source = readFileSync(new URL(path, import.meta.url), "utf8");
      expect(source).not.toMatch(/powered\s+by\s+(?:CareOS|North)/i);
    },
  );
});
