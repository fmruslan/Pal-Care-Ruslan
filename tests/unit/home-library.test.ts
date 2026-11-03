import { describe, expect, it } from "vitest";
import { demoData } from "../../src/lib/demo/fixtures";
import {
  homeLibrary,
  libraryWords,
  LIBRARY_PAGE_SIZE,
} from "../../src/lib/demo/library";
import {
  libraryHref,
  libraryReturn,
  parseLibraryQuery,
  withLibraryReturn,
} from "../../src/lib/library-navigation";
import type { DemoData } from "../../src/db/schema";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LibraryResults } from "../../src/components/home-library";

const query = (q = "", rest = {}) => parseLibraryQuery({ q, ...rest });
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function sandboxData() {
  const data = structuredClone(demoData);
  const product = data.products.find((p) => p.model === "F-01")!;
  data.twins.push({
    ...data.twins[0],
    id: id(205),
    origin: "sandbox",
    purchasedOn: "2026-10-22",
    purchasePriceMinor: 12900,
    checkoutOrderId: id(901),
    paypalOrderId: "ORDER123456789",
    paypalCaptureId: "CAPTURE123456789",
    verifiedAt: "2026-10-22T10:00:00Z",
    productSnapshot: {
      ...product,
      currency: "USD",
      merchantName: data.merchant.name,
    },
    createdAt: "2026-10-22T10:00:00Z",
  });
  data.documents.push(
    {
      id: id(305),
      twinId: id(205),
      title: "Headphones Sandbox receipt",
      kind: "receipt",
      origin: "sandbox",
      content: "Dedicated test only",
    },
    {
      id: id(306),
      twinId: id(205),
      title: "Demo merchant policy",
      kind: "policy",
      origin: "sample",
      content: "Sample policy",
    },
  );
  return data;
}

describe("read-only Home library", () => {
  it("finds kettle receipt directly using product and document metadata together", () => {
    const result = homeLibrary(demoData, query("kettle receipt"));
    expect(result.purchases.map((p) => p.id)).toEqual([id(202)]);
    expect(result.documents.map((d) => d.document.id)).toEqual([id(302)]);
  });
  it.each([
    "H-02 receipts",
    "HEARTH receipt",
    " kettle   RECEIPT ",
    "pour-over receipt",
  ])("normalizes %s without a model", (q) => {
    expect(
      homeLibrary(demoData, query(q)).documents.map((d) => d.document.id),
    ).toEqual([id(302)]);
  });
  it("retains distinct dated headphones and their own receipts", () => {
    const result = homeLibrary(sandboxData(), query("headphones receipt"));
    expect(result.purchases.map((p) => p.id)).toEqual([id(205), id(201)]);
    expect(result.documents.map((d) => d.document.id)).toEqual([
      id(305),
      id(301),
    ]);
    expect(result.purchases.map((p) => p.amountMinor)).toEqual([12900, 14900]);
  });
  it("never promotes an attached sample policy to verified evidence", () => {
    const result = homeLibrary(
      sandboxData(),
      query("policy", { source: "sandbox" }),
    );
    expect(result.documents).toHaveLength(1);
    expect(result.documents[0].document.origin).toBe("sample");
    expect(result.documents[0].purchase.origin).toBe("sandbox");
  });
  it("uses original saved product snapshots rather than later catalog names or prices", () => {
    const data = sandboxData();
    const product = data.products.find((p) => p.model === "F-01")!;
    product.name = "Different catalog product";
    product.priceMinor = 99999;
    const result = homeLibrary(
      data,
      query("headphones receipt", { source: "sandbox" }),
    );
    expect(result.purchases[0].name).toBe("Everyday headphones");
    expect(result.purchases[0].amountMinor).toBe(12900);
  });
  it("composes category, purchase-source and document filters without broadening empty results", () => {
    expect(
      homeLibrary(
        sandboxData(),
        query("receipt", { category: "Kitchen", source: "sandbox" }),
      ).documents,
    ).toEqual([]);
    const data = structuredClone(demoData);
    data.documents = data.documents.filter((d) => d.twinId !== id(202));
    expect(
      homeLibrary(data, query("kettle", { documents: "missing" })).purchases,
    ).toHaveLength(1);
    expect(
      homeLibrary(data, query("kettle", { documents: "present" })).purchases,
    ).toHaveLength(0);
  });
  it("does not invent missing manuals or search untrusted document bodies", () => {
    const data = structuredClone(demoData);
    data.documents[0].content = "magic search word";
    expect(homeLibrary(data, query("manual")).documents).toEqual([]);
    expect(homeLibrary(data, query("magic")).documents).toEqual([]);
    expect(homeLibrary(data, query("!!!")).valid).toBe(false);
  });
  it("rejects unsupported filters instead of pretending the library has no records", () => {
    for (const params of [
      { category: "unknown" },
      { source: "verified" },
      { q: ["kettle", "speaker"] },
      { q: "x".repeat(129) },
      { page: "-1" },
    ]) {
      const result = homeLibrary(demoData, parseLibraryQuery(params));
      expect(result.valid).toBe(false);
      expect(result.purchases).toEqual([]);
    }
  });
  it("deduplicates identical evidence and excludes conflicting document identities", () => {
    const data = structuredClone(demoData);
    data.twins.push(structuredClone(data.twins[0]));
    data.documents.push(structuredClone(data.documents[0]));
    expect(homeLibrary(data, query()).totalDocuments).toBe(4);
    data.documents[4].title = "Conflicting title";
    const result = homeLibrary(data, query("headphones receipt"));
    expect(result.documents).toEqual([]);
    expect(result.complete).toBe(false);
  });
  it("excludes foreign, invalid-provenance and conflicting purchases", () => {
    for (const change of [
      { customerId: id(999) },
      { origin: "sandbox" },
      { currency: "EUR" },
    ]) {
      const data = structuredClone(demoData);
      Object.assign(data.twins[0], change);
      expect(
        homeLibrary(data, query()).purchases.some((p) => p.id === id(201)),
      ).toBe(false);
    }
    const data = structuredClone(demoData);
    data.twins.push({ ...data.twins[0], purchasePriceMinor: 1 });
    expect(
      homeLibrary(data, query()).purchases.some((p) => p.id === id(201)),
    ).toBe(false);
  });
  it("never invents a reference price or receipt", () => {
    const result = homeLibrary(demoData, query("raspberry"));
    expect(result.purchases[0].amountMinor).toBeNull();
    expect(result.purchases[0].receiptHref).toBeNull();
  });
  it("searches the whole bounded library before pagination and sorts stably", () => {
    const data = structuredClone(demoData);
    data.twins = Array.from({ length: 30 }, (_, i) => ({
      ...data.twins[0],
      id: id(600 + i),
      purchasedOn: `2026-09-${String(i + 1).padStart(2, "0")}`,
    }));
    data.documents = [
      {
        ...data.documents[0],
        id: id(950),
        twinId: id(600),
        title: "Oldest headphones receipt",
      },
    ];
    expect(homeLibrary(data, query()).purchases).toHaveLength(
      LIBRARY_PAGE_SIZE,
    );
    expect(
      homeLibrary(data, query("oldest receipt")).documents[0].purchase.id,
    ).toBe(id(600));
    expect(
      homeLibrary(data, query("", { sort: "oldest" })).purchases[0].id,
    ).toBe(id(600));
    expect(homeLibrary(data, query("", { page: "999" })).page).toBe(3);
  });
  it("labels capped or invalid evidence partial instead of claiming complete history", () => {
    const data: DemoData = structuredClone(demoData);
    data.twins = Array.from({ length: 1001 }, (_, i) => ({
      ...data.twins[0],
      id: id(2000 + i),
    }));
    data.documents = [];
    const result = homeLibrary(data, query());
    expect(result.totalPurchases).toBe(1000);
    expect(result.complete).toBe(false);
  });
  it("does not mislabel a paginated result group as globally empty", () => {
    const data = structuredClone(demoData);
    data.documents = Array.from({ length: 25 }, (_, i) => ({
      ...data.documents[0],
      id: id(1000 + i),
    }));
    const q = query("headphones", { page: "2" });
    const library = homeLibrary(data, q);
    expect(library.purchaseCount).toBe(1);
    expect(library.purchases).toHaveLength(0);
    expect(library.documents).toHaveLength(12);
    const html = renderToStaticMarkup(
      createElement(LibraryResults, { library, query: q }),
    );
    expect(html).toContain("No purchases on this page");
    expect(html).not.toContain("No matching purchases");
  });
});

describe("bounded library URLs", () => {
  it("round-trips filter/view/page state and keeps search unified", () => {
    const q = query("kettle receipt", {
      category: "Kitchen",
      source: "sample",
      sort: "oldest",
      page: "2",
      view: "documents",
    });
    expect(q.view).toBe("purchases");
    const href = libraryHref(q);
    expect(libraryReturn(href)).toBe(href);
    expect(
      withLibraryReturn(`/vault/${id(202)}`, href, "#documents"),
    ).toContain(`?from=${encodeURIComponent(href)}#documents`);
  });
  it.each([
    "https://evil.test/dashboard",
    "//evil.test/dashboard",
    "/merchant",
    "/dashboard?source=bad",
    ["/dashboard", "/merchant"],
    "/dashboard?q=a&q=b",
  ])("rejects unsafe or ambiguous return targets %s", (value) => {
    expect(libraryReturn(value)).toBe("/dashboard");
  });
  it("normalizes punctuation and accents without interpreting executable input", () => {
    expect(libraryWords("Réceipts / H-02")).toEqual(["receipt", "h", "02"]);
    expect(libraryWords("constructor prototype")).toEqual([
      "constructor",
      "prototype",
    ]);
  });
});
