import type { CareDocument, DemoData } from "../../db/schema";
import {
  customerDataset,
  type CustomerPurchase,
} from "../intelligence/customer-model";
import { RECORDS_LIMIT } from "../careos/records/contracts";
import { findTwin } from "./presentation";
import { type LibraryQuery } from "../library-navigation";

export const LIBRARY_PAGE_SIZE = 12;
export type LibraryPurchase = CustomerPurchase & {
  brand: string;
  documents: CareDocument[];
};
export type LibraryDocument = {
  document: CareDocument;
  purchase: LibraryPurchase;
};
const aliases = new Map([
  ["receipts", "receipt"],
  ["documents", "document"],
  ["docs", "document"],
  ["policies", "policy"],
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
  const normalized = libraryWords(text).join(" ");
  return words.every((word) => normalized.includes(word));
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
    (query.category === "all" || categories.includes(query.category));
  const words = libraryWords(query.q);
  const productText = (p: LibraryPurchase) =>
    `${p.name} ${p.brand} ${p.model} ${p.category}`;
  const documentText = (d: CareDocument) => `${d.title} ${d.kind} document`;
  const scoped = valid
    ? purchases.filter(
        (p) =>
          (query.category === "all" || p.category === query.category) &&
          (query.source === "all" || p.origin === query.source) &&
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
          matches(words, `${productText(p)} ${documentText(doc)}`),
        ),
    )
    .sort(order);
  const documents: LibraryDocument[] = scoped
    .flatMap((purchase) =>
      purchase.documents
        .filter((doc) =>
          matches(words, `${productText(purchase)} ${documentText(doc)}`),
        )
        .map((document) => ({ document, purchase })),
    )
    .sort(
      (a, b) =>
        order(a.purchase, b.purchase) ||
        a.document.title.localeCompare(b.document.title) ||
        a.document.id.localeCompare(b.document.id),
    );
  const total =
    query.view === "documents"
      ? documents.length
      : Math.max(found.length, query.q ? documents.length : 0);
  const pages = Math.max(1, Math.ceil(total / LIBRARY_PAGE_SIZE));
  const page = Math.min(query.page, pages);
  const start = (page - 1) * LIBRARY_PAGE_SIZE;
  return {
    searchIndex: purchases.map(
      (p) =>
        `${p.name} ${p.brand} ${p.model} ${p.category} ${p.documents.map((d) => `${d.title} ${d.kind}`).join(" ")}`,
    ),
    purchases: found.slice(start, start + LIBRARY_PAGE_SIZE),
    documents: documents.slice(start, start + LIBRARY_PAGE_SIZE),
    purchaseCount: found.length,
    documentCount: documents.length,
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
