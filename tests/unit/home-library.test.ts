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
import {
  LibraryPurchaseCard,
  LibraryResults,
} from "../../src/components/home-library";
import {
  withTenProductFixtures,
  tenProductPack,
} from "../../src/lib/care/demo/catalog";
import { withConsumerDemoFixtures } from "../../src/lib/care/demo/consumer-evidence";
import { classifyLibraryDocument } from "../../src/lib/document-classification";

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

function completeLibraryData() {
  const data = withConsumerDemoFixtures(
    withTenProductFixtures(structuredClone(demoData)),
  );
  const sandbox = sandboxData();
  data.twins.push({ ...sandbox.twins.at(-1)!, id: id(2205) });
  data.documents.push(
    ...sandbox.documents
      .slice(-2)
      .map((d, i) => ({ ...d, id: id(1305 + i), twinId: id(2205) })),
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
  it("keeps the legacy accessible-name prefix without overriding visible card text", () => {
    const purchase = homeLibrary(demoData, query("headphones")).purchases[0];
    const html = renderToStaticMarkup(
      createElement(LibraryPurchaseCard, { purchase, from: "/purchases" }),
    );
    expect(html).toContain(
      '<span class="sr-only">View details for Everyday headphones, </span>',
    );
    expect(html).not.toContain('aria-label="View details for');
    expect(html).toContain("Forma");
    expect(html).toContain("F-01");
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
  it("round-trips filter/view/page state and keeps document search in Documents", () => {
    const q = query("kettle receipt", {
      category: "Kitchen",
      source: "sample",
      sort: "oldest",
      page: "2",
      view: "documents",
      documentCategory: "receipts",
      product: id(202),
    });
    expect(q.view).toBe("documents");
    const href = libraryHref(q);
    expect(href).toMatch(/^\/documents\?/);
    expect(href).toContain("documentCategory=receipts");
    expect(href).toContain(`product=${id(202)}`);
    expect(libraryReturn(href)).toBe(href);
    expect(
      withLibraryReturn(`/vault/${id(202)}`, href, "#documents"),
    ).toContain(`?from=${encodeURIComponent(href)}#documents`);
  });
  it("canonicalizes legacy document-view returns without losing filters", () => {
    expect(
      libraryReturn(
        `/purchases?view=documents&q=kettle&category=Kitchen&documentCategory=receipts&product=${id(202)}&source=sample&page=2`,
      ),
    ).toBe(
      `/documents?q=kettle&category=Kitchen&source=sample&documentCategory=receipts&product=${id(202)}&page=2`,
    );
    expect(libraryReturn("/documents?q=receipt")).toBe("/documents?q=receipt");
    expect(parseLibraryQuery({ documentCategory: "manual" }).valid).toBe(false);
    expect(parseLibraryQuery({ product: "headphones" }).valid).toBe(false);
  });
  it.each([
    "https://evil.test/dashboard",
    "//evil.test/dashboard",
    "/merchant",
    "/dashboard?source=bad",
    ["/dashboard", "/merchant"],
    "/dashboard?q=a&q=b",
  ])("rejects unsafe or ambiguous return targets %s", (value) => {
    expect(libraryReturn(value)).toBe("/purchases");
  });
  it("normalizes punctuation and accents without interpreting executable input", () => {
    expect(libraryWords("Réceipts / H-02")).toEqual(["receipt", "h", "02"]);
    expect(libraryWords("constructor prototype")).toEqual([
      "constructor",
      "prototype",
    ]);
  });
});

describe("organized Documents library", () => {
  it("preserves all 25 documents, exact identities and associations with data-derived provenance", () => {
    const data = completeLibraryData();
    const first = homeLibrary(data, query("", { view: "documents" }));
    expect(first.totalDocuments).toBe(25);
    expect(first.provenanceCounts).toEqual({ sandbox: 1, sample: 10 });
    expect(first.documentCategoryCounts).toEqual({
      all: 25,
      receipts: 9,
      warranties: 3,
      care: 1,
      returns: 5,
      other: 7,
    });
    const loaded = Array.from(
      { length: first.pages },
      (_, i) =>
        homeLibrary(data, query("", { view: "documents", page: String(i + 1) }))
          .documents,
    ).flat();
    expect(loaded.map((d) => d.document.id).sort()).toEqual(
      data.documents.map((d) => d.id).sort(),
    );
    for (const item of loaded) {
      expect(item.document).toEqual(
        data.documents.find((d) => d.id === item.document.id),
      );
      expect(item.document.twinId).toBe(item.purchase.id);
    }
    expect(first.complete).toBe(true);
    const html = renderToStaticMarkup(
      createElement(LibraryResults, {
        library: first,
        query: query("", { view: "documents" }),
      }),
    );
    expect(html).toContain("1 Sandbox · 10 examples");
    const warrantyScope = homeLibrary(
      data,
      query("", { view: "documents", documentCategory: "warranties" }),
    );
    expect(warrantyScope.purchaseCount).toBe(3);
    expect(warrantyScope.provenanceCounts).toEqual({ sandbox: 0, sample: 3 });
  });

  it("filters exact dated Twins rather than combining both headphones histories", () => {
    const data = completeLibraryData();
    const sample = homeLibrary(
      data,
      query("headphones", {
        view: "documents",
        documentCategory: "warranties",
        product: id(201),
      }),
    );
    expect(sample.documents.map((d) => d.document.id)).toEqual([id(501)]);
    const verified = homeLibrary(
      data,
      query("headphones", {
        view: "documents",
        documentCategory: "warranties",
        product: id(2205),
      }),
    );
    expect(verified.documents).toEqual([]);
    expect(verified.documentCategoryCounts.all).toBe(2);
    expect(verified.valid).toBe(true);
    expect(
      homeLibrary(data, query("", { view: "documents", product: id(999) }))
        .valid,
    ).toBe(false);
  });

  it("does not classify ambiguous ownership, delivery or price notes as care manuals", () => {
    const data = completeLibraryData();
    const result = homeLibrary(
      data,
      query("", { view: "documents", documentCategory: "care" }),
    );
    expect(result.documents.map((d) => d.document.id)).toEqual([id(303)]);
    expect(
      homeLibrary(data, query("manual", { view: "documents" })).documents,
    ).toEqual([]);
    expect(
      homeLibrary(
        data,
        query("raspberry", { view: "documents", documentCategory: "care" }),
      ).documents,
    ).toEqual([]);
    expect(
      homeLibrary(
        data,
        query("2026-10-18", {
          view: "documents",
          documentCategory: "warranties",
        }),
      ).documents.map((d) => d.document.id),
    ).toEqual([id(501)]);
  });

  it("requires exact trusted document/content/Twin/product binding, never a warranty title", () => {
    const data = completeLibraryData();
    const purchase = homeLibrary(data, query()).allPurchases.find(
      (p) => p.id === id(201),
    )!;
    const doc = data.documents.find(
      (d) =>
        d.id ===
        tenProductPack.scenarios.find((s) => s.twinId === purchase.id)!
          .documentId,
    )!;
    expect(classifyLibraryDocument(doc, purchase)).toBe("warranties");
    for (const changed of [
      { ...doc, content: "Warranty manufacturer manual" },
      { ...doc, id: id(999), title: "Warranty" },
      { ...doc, twinId: id(2205) },
    ]) {
      expect(classifyLibraryDocument(changed, purchase)).toBe("other");
    }
    expect(
      classifyLibraryDocument(doc, { ...purchase, productId: id(104) }),
    ).toBe("other");
    expect(
      classifyLibraryDocument(doc, { ...purchase, origin: "sandbox" }),
    ).toBe("other");
  });

  it("composes document category, metadata, source and pagination without broadening empties", () => {
    const data = completeLibraryData();
    const q = query("receipt", {
      view: "documents",
      documentCategory: "receipts",
      source: "sandbox",
      product: id(2205),
      page: "2",
    });
    const result = homeLibrary(data, q);
    expect(result.documentCount).toBe(1);
    expect(result.page).toBe(1);
    expect(result.documents[0].document.id).toBe(id(1305));
    const emptyQuery = query("", {
      view: "documents",
      documentCategory: "care",
      product: id(2205),
    });
    const html = renderToStaticMarkup(
      createElement(LibraryResults, {
        library: homeLibrary(data, emptyQuery),
        query: emptyQuery,
      }),
    );
    expect(html).toContain("No saved documents");
    expect(html).toContain(
      "These are saved care documents, not automatically supplied manuals. Example care cards are fictional.",
    );
    expect(html).not.toContain("data-document-id=");
  });
});
