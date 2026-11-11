import { describe, expect, it } from "vitest";
import {
  productGuideAnswer,
  productGuideReplySchema,
  productGuideStoredReplySchema,
} from "../../src/lib/careos/product-guide";
import { malformedGuideSteps } from "../fixtures/product-guide-prose";

const reply = () => ({
  text: "Use the saved records in Purchases & Docs, then inspect their sources.",
  steps: ["Open the intended dated purchase and review its saved documents."],
  features: ["library" as const, "receipts" as const],
});
const prohibited = [
  ...Array.from({ length: 32 }, (_, n) => n).filter(
    (n) => ![9, 10, 13].includes(n),
  ),
  ...Array.from({ length: 33 }, (_, n) => n + 127),
  0x00ad,
  0x034f,
  0x061c,
  0x180e,
  0x200b,
  0x200c,
  0x200d,
  0x200e,
  0x200f,
  0x202a,
  0x202b,
  0x202c,
  0x202d,
  0x202e,
  0x2060,
  0x2066,
  0x2067,
  0x2068,
  0x2069,
  0xfeff,
  0x110bd,
  0xe0001,
  0xe0020,
  0xe007f,
];
const withProse = (text: string, field: "text" | "steps") =>
  field === "text" ? { ...reply(), text } : { ...reply(), steps: [text] };
// Synthetic complete imperative; pinned Zod counts Unicode code points.
const proseAt = (length: number) => `Read ${"x".repeat(length - 6)}.`;
describe("bounded readable product-guide output", () => {
  it("rejects C0/DEL, C1, format/bidi/joiner and invisible controls without rewriting", () => {
    for (const code of prohibited) {
      for (const field of ["text", "steps"] as const) {
        // A valid final period cannot conceal a prohibited character inside.
        const input = withProse(
          `Review ${String.fromCodePoint(code)}the saved receipt.`,
          field,
        );
        const original = structuredClone(input);
        expect(productGuideReplySchema.safeParse(input).success).toBe(false);
        expect(() => productGuideAnswer(input)).toThrow();
        expect(input).toEqual(original);
      }
    }
  });
  it.each(malformedGuideSteps)(
    "retains $caseId in storage, but rejects fresh prose in either field",
    ({ text, length }) => {
      expect(text).toHaveLength(length);
      for (const field of ["text", "steps"] as const) {
        const input = withProse(text, field);
        const before = JSON.stringify(input);
        expect(productGuideReplySchema.safeParse(input).success).toBe(false);
        expect(() => productGuideAnswer(input)).toThrow();
        expect(JSON.stringify(productGuideStoredReplySchema.parse(input))).toBe(
          before,
        );
        expect(JSON.stringify(input)).toBe(before);
      }
    },
  );
  it("rejects fragments, empty prose, ellipses and trailing whitespace without appending punctuation", () => {
    for (const text of [
      "Review the saved receipt",
      "Review the saved receipt...",
      "Review the saved receipt….",
      "Review the saved receipt…?",
      "Review the saved receipt...\u201d",
      " ".repeat(20),
      `${" ".repeat(20)}.`,
      `${".".repeat(20)}`,
      "Review the saved receipt.\n",
      "Review the saved receipt.\r",
      "Review the saved receipt.\t",
      "Review the saved receipt. ",
      "Review the saved receipt.\u2028",
      "Review the saved receipt.\u2029",
    ]) {
      for (const field of ["text", "steps"] as const) {
        const input = withProse(text, field);
        const before = JSON.stringify(input);
        expect(productGuideReplySchema.safeParse(input).success).toBe(false);
        expect(JSON.stringify(input)).toBe(before);
      }
    }
  });
  it("preserves valid Unicode, ordinary whitespace, feature identity and resolved links", () => {
    const input = reply();
    input.text =
      "Care → Purchases & Docs → Insights. Example ≠ Verified Sandbox.\nReview café / cafe\u0301, 保存记录, مرحبا, 🙂 and saved\u00a0evidence.\r\tRead “Sources”.";
    const answer = productGuideAnswer(input);
    expect(answer.text).toBe(input.text);
    expect(answer.steps).toEqual(input.steps);
    expect(answer.sources.map((s) => s.id)).toEqual([
      "palcare-interface-library",
      "palcare-interface-receipts",
    ]);
    expect(answer.actions.map((a) => a.href)).toEqual([
      "/purchases",
      "/documents",
    ]);
  });
  it("retains exact original caps, strict keys and known feature allowlist", () => {
    const input = {
      ...reply(),
      text: proseAt(620),
      steps: [proseAt(180)],
    };
    expect(productGuideReplySchema.safeParse(input).success).toBe(true);
    expect(
      productGuideReplySchema.safeParse({ ...input, text: proseAt(621) })
        .success,
    ).toBe(false);
    expect(
      productGuideReplySchema.safeParse({
        ...input,
        steps: [proseAt(181)],
      }).success,
    ).toBe(false);
    expect(
      productGuideReplySchema.safeParse({ ...input, features: ["send_refund"] })
        .success,
    ).toBe(false);
    expect(
      productGuideReplySchema.safeParse({ ...input, authority: "owner" })
        .success,
    ).toBe(false);
  });
  it("retains lower bounds, Unicode code-point boundaries, item bounds and closing punctuation", () => {
    const minimal = { ...reply(), text: proseAt(20), steps: ["Read."] };
    expect(productGuideReplySchema.parse(minimal)).toEqual(minimal);
    expect(
      productGuideReplySchema.safeParse({ ...minimal, text: proseAt(19) })
        .success,
    ).toBe(false);
    expect(
      productGuideReplySchema.safeParse({ ...minimal, steps: ["Go!?"] })
        .success,
    ).toBe(false);
    for (const ending of [
      ".",
      "!",
      "?",
      "。",
      "！",
      "？",
      ".\u201d",
      "?\u2019",
      ".)",
      ".]",
      ".}",
      "。」",
    ]) {
      const input = withProse(`Review the saved receipt${ending}`, "steps");
      expect(productGuideReplySchema.parse(input)).toEqual(input);
    }
    const unicode = { ...minimal, steps: [`Read 🙂${"x".repeat(173)}.`] };
    expect([...unicode.steps[0]]).toHaveLength(180);
    expect(unicode.steps[0]).toHaveLength(181);
    expect(productGuideReplySchema.parse(unicode)).toEqual(unicode);
    expect(
      productGuideReplySchema.safeParse({
        ...unicode,
        steps: [`Read 🙂${"x".repeat(174)}.`],
      }).success,
    ).toBe(false);
    expect(
      productGuideReplySchema.safeParse({
        ...minimal,
        text: `R${"🙂".repeat(18)}.`,
      }).success,
    ).toBe(true);
    expect(
      productGuideReplySchema.safeParse({
        ...minimal,
        text: `R${"🙂".repeat(17)}.`,
      }).success,
    ).toBe(false);
    expect(
      productGuideReplySchema.safeParse({ ...minimal, steps: ["R🙂🙂🙂."] })
        .success,
    ).toBe(true);
    expect(
      productGuideReplySchema.safeParse({ ...minimal, steps: ["R🙂🙂."] })
        .success,
    ).toBe(false);
    for (const count of [1, 5]) {
      expect(
        productGuideReplySchema.safeParse({
          ...minimal,
          steps: Array(count).fill("Read."),
        }).success,
      ).toBe(true);
    }
    for (const count of [0, 6]) {
      expect(
        productGuideReplySchema.safeParse({
          ...minimal,
          steps: Array(count).fill("Read."),
        }).success,
      ).toBe(false);
    }
    expect(
      productGuideReplySchema.safeParse({
        ...minimal,
        features: ["care", "library", "north"],
      }).success,
    ).toBe(true);
    for (const features of [[], ["care", "library", "north", "limits"]]) {
      expect(
        productGuideReplySchema.safeParse({ ...minimal, features }).success,
      ).toBe(false);
    }
  });
});
