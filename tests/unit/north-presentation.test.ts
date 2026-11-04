import { describe, expect, it } from "vitest";
import {
  documentPreviewId,
  isLiteralLibrarySearch,
  metadataWords,
  readNorthWorkspace,
} from "../../src/lib/north-presentation";

describe("one-field literal metadata search, not conversational intent parsing", () => {
  const index = [
    "Everyday headphones Forma F-01 Audio sample receipt",
    "Pour-over kettle Hearth H-02 Kitchen Kettle receipt",
  ];
  it.each(["Headphones", "KETTLE receipt", "Forma", "H-02", "Audio"])(
    "keeps literal %s searches provider-free",
    (input) => {
      expect(isLiteralLibrarySearch(input, index)).toBe(true);
    },
  );
  it.each([
    "Pull up my kettle receipt",
    "Only Audio",
    "Show that as a chart",
    "How do I care for these headphones?",
    "Show all my purchases and how much I spent",
    "not in my saved metadata",
    "care for Forma F-01",
  ])("leaves %s unchanged for genuine conversation", (input) => {
    expect(isLiteralLibrarySearch(input, index)).toBe(false);
  });
  it("never treats punctuation, empty, oversized or executable-looking input as a command", () => {
    expect(isLiteralLibrarySearch("!!!", index)).toBe(false);
    expect(isLiteralLibrarySearch("", index)).toBe(false);
    expect(isLiteralLibrarySearch("x".repeat(129), index)).toBe(false);
    expect(metadataWords("constructor café")).toEqual(["constructor", "cafe"]);
  });
  it("does not mistake care language for substrings of saved names", () => {
    expect(
      isLiteralLibrarySearch("care for Forma F-01", ["Forma F-01 care card"]),
    ).toBe(false);
    expect(
      isLiteralLibrarySearch("Forma F-01 care card", ["Forma F-01 care card"]),
    ).toBe(true);
  });
});

describe("presentation hints and exact saved-document previews", () => {
  const id = "00000000-0000-4000-8000-000000000302";
  it("stores only selection identity, never trusted content or executable actions", () => {
    expect(
      readNorthWorkspace(JSON.stringify({ version: 1, id, open: true })),
    ).toEqual({ version: 1, id, open: true, historySelected: false });
    expect(
      readNorthWorkspace(JSON.stringify({ version: 1, id: null, open: false })),
    ).toEqual({ version: 1, id: null, open: false, historySelected: false });
    for (const raw of [
      "{",
      "x".repeat(257),
      JSON.stringify({ version: 2, id, open: true }),
      JSON.stringify({ version: 1, id: "/merchant", open: true }),
      JSON.stringify({ version: 1, id, open: "true" }),
      JSON.stringify({ version: 1, id, open: true, historySelected: "true" }),
      JSON.stringify({
        version: 1,
        id: null,
        open: true,
        historySelected: true,
      }),
    ])
      expect(readNorthWorkspace(raw)).toBeNull();
  });
  it("preserves an explicit context override independently of the displayed result", () => {
    for (const historySelected of [true, false]) {
      expect(
        readNorthWorkspace(
          JSON.stringify({ version: 1, id, open: true, historySelected }),
        ),
      ).toEqual({ version: 1, id, open: true, historySelected });
    }
  });
  it("accepts only the exact existing internal document identity", () => {
    expect(documentPreviewId(`/documents/${id}`)).toBe(id);
    for (const href of [
      `https://evil.test/documents/${id}`,
      `//evil.test/documents/${id}`,
      `/documents/${id}?redirect=external`,
      `/documents/${id}/../x`,
      "javascript:alert(1)",
    ])
      expect(documentPreviewId(href)).toBeNull();
  });
});
