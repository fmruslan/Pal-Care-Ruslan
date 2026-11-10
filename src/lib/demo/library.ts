import type { CareDocument, DemoData } from "../../db/schema";
import {
  customerDataset,
  type CustomerPurchase,
} from "../intelligence/customer-model";
import { RECORDS_LIMIT } from "../careos/records/contracts";
import { findTwin } from "./presentation";
import { type LibraryQuery } from "../library-navigation";
import {
  classifyLibraryDocument,
  documentClassificationLabels,
  type DocumentClassification,
} from "../document-classification";

export const LIBRARY_PAGE_SIZE = 12;
export type LibraryPurchase = CustomerPurchase & {
  brand: string;
  productId: string;
  documents: CareDocument[];
};
export type LibraryDocument = {
  document: CareDocument;
  purchase: LibraryPurchase;
  classification: DocumentClassification;
};
const aliases = new Map([
  ["receipts", "receipt"],
  ["documents", "document"],
  ["docs", "document"],
  ["policies", "policy"],
  ["warranties", "warranty"],
  ["guides", "guide"],
]);

export function libraryWords(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => aliases.get(word) ?? word);
}
const matches = (words: string[], text: string) => {
  const normalized = libraryWords(text);
  // Short model fragments and numbers must match a token: H-02 must not
  // match the H in headphones plus 02 inside the purchase year 2026.
  return words.every((word) =>
    normalized.some((token) =>
      word.length <= 2 || /^\d+$/.test(word)
        ? token === word
        : token.includes(word),
    ),
  );
};

/** Fixed scope and saved evidence are validated by the existing customer projection.
 * Search is read-only metadata retrieval, not an assistant turn or provider call. */
export function homeLibrary(data: DemoData, query: LibraryQuery) {
  const projection = customerDataset(
    data,
    [],
    null,
    { items: [], unavailable: [] },
    [],
    RECORDS_LIMIT,
  );
  const conflicting = new Set<string>();
  const docs = new Map<string, CareDocument>();
  for (const doc of data.documents) {
    if (
      docs.has(doc.id) &&
      JSON.stringify(docs.get(doc.id)) !== JSON.stringify(doc)
    )
      conflicting.add(doc.id);
    docs.set(doc.id, doc);
  }
  const purchases: LibraryPurchase[] = projection.purchases.flatMap(
    (purchase) => {
      const record = findTwin(data, purchase.id);
      if (
        !record ||
        !/^\d{4}-\d{2}-\d{2}$/.test(purchase.purchasedOn) ||
        !Number.isFinite(Date.parse(purchase.purchasedOn))
      )
        return [];
      const allowed = new Set(
        purchase.documentLinks.map((doc) => doc.href.split("/").at(-1)),
      );
      const documents = [...docs.values()].filter(
        (doc) =>
          doc.twinId === purchase.id &&
          allowed.has(doc.id) &&
          !conflicting.has(doc.id),
      );
      const receipt = documents.find((doc) => doc.kind === "receipt");
      return [
        {
          ...purchase,
          brand: record.product.brand,
          productId: record.product.id,
          documents,
          documentCount: documents.length,
          receiptHref: receipt ? `/documents/${receipt.id}` : null,
        },
      ];
    },
  );
  const categories = [...new Set(purchases.map((p) => p.category))].sort();
  const valid =
    query.valid &&
    (!query.q || libraryWords(query.q).length > 0) &&
    (query.category === "all" || categories.includes(query.category)) &&
    (query.product === "all" || purchases.some((p) => p.id === query.product));
  const words = libraryWords(query.q);
  const productText = (p: LibraryPurchase) =>
    `${p.name} ${p.brand} ${p.model} ${p.category} ${p.purchasedOn} ${p.origin === "sandbox" ? "Verified Sandbox" : "Sample"}`;
  const classification = (d: CareDocument, p: LibraryPurchase) =>
    classifyLibraryDocument(d, p);
  const documentText = (d: CareDocument, p: LibraryPurchase) =>
    `${p.documentLinks.find((link) => link.href === `/documents/${d.id}`)?.displayTitle ?? ""} ${d.title} ${d.kind} document ${classification(d, p) === "care" ? "Sample care card guide" : documentClassificationLabels[classification(d, p)]}`;
  const scoped = valid
    ? purchases.filter(
        (p) =>
          (query.category === "all" || p.category === query.category) &&
          (query.source === "all" || p.origin === query.source) &&
          (query.product === "all" || p.id === query.product) &&
          (query.documents === "all" ||
            (query.documents === "present") === p.documents.length > 0),
      )
    : [];
  const order = (a: LibraryPurchase, b: LibraryPurchase) =>
    (query.sort === "name"
      ? a.name.localeCompare(b.name)
      : (query.sort === "oldest" ? 1 : -1) *
        a.purchasedOn.localeCompare(b.purchasedOn)) || a.id.localeCompare(b.id);
  const found = scoped
    .filter(
      (p) =>
        matches(words, productText(p)) ||
        p.documents.some((doc) =>
          matches(words, `${productText(p)} ${documentText(doc, p)}`),
        ),
    )
    .sort(order);
  const matchingDocuments: LibraryDocument[] = scoped
    .flatMap((purchase) =>
      purchase.documents
        .filter((doc) =>
          matches(
            words,
            `${productText(purchase)} ${documentText(doc, purchase)}`,
          ),
        )
        .map((document) => ({
          document,
          purchase,
          classification: classification(document, purchase),
        })),
    )
    .sort(
      (a, b) =>
        order(a.purchase, b.purchase) ||
        a.document.title.localeCompare(b.document.title) ||
        a.document.id.localeCompare(b.document.id),
    );
  const documentCategoryCounts = {
    all: matchingDocuments.length,
    receipts: matchingDocuments.filter((d) => d.classification === "receipts")
      .length,
    warranties: matchingDocuments.filter(
      (d) => d.classification === "warranties",
    ).length,
    care: matchingDocuments.filter((d) => d.classification === "care").length,
    returns: matchingDocuments.filter((d) => d.classification === "returns")
      .length,
    other: matchingDocuments.filter((d) => d.classification === "other").length,
  };
  const documents =
    query.view === "documents" && query.documentCategory !== "all"
      ? matchingDocuments.filter(
          (d) => d.classification === query.documentCategory,
        )
      : matchingDocuments;
  const documentPurchases = new Set(documents.map((d) => d.purchase.id));
  const countedPurchases =
    query.view === "documents"
      ? found.filter((p) => documentPurchases.has(p.id))
      : found;
  const total =
    query.view === "documents"
      ? documents.length
      : Math.max(found.length, query.q ? documents.length : 0);
  const pages = Math.max(1, Math.ceil(total / LIBRARY_PAGE_SIZE));
  const page = Math.min(query.page, pages);
  const start = (page - 1) * LIBRARY_PAGE_SIZE;
  return {
    allPurchases: purchases,
    searchIndex: purchases.map(
      (p) =>
        `${productText(p)} ${p.documents.map((d) => documentText(d, p)).join(" ")}`,
    ),
    purchases: found.slice(start, start + LIBRARY_PAGE_SIZE),
    documents: documents.slice(start, start + LIBRARY_PAGE_SIZE),
    purchaseCount: countedPurchases.length,
    documentCount: documents.length,
    documentCategoryCounts,
    provenanceCounts: {
      sandbox: countedPurchases.filter((p) => p.origin === "sandbox").length,
      sample: countedPurchases.filter((p) => p.origin === "sample").length,
    },
    totalPurchases: purchases.length,
    totalDocuments: purchases.reduce((n, p) => n + p.documents.length, 0),
    categories,
    valid,
    page,
    pages,
    complete:
      data.twins.length <= RECORDS_LIMIT &&
      purchases.length === new Set(data.twins.map((p) => p.id)).size &&
      !projection.unavailable.some(
        (v) => v === "Purchase scope" || v === "Purchase evidence",
      ) &&
      conflicting.size === 0 &&
      new Set(data.documents.map((d) => d.id)).size ===
        purchases.reduce((n, p) => n + p.documents.length, 0),
    limit: RECORDS_LIMIT,
  };
}
