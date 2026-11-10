import {
  ArrowRight,
  ArrowLeft,
  FileText,
  ChevronRight,
  SlidersHorizontal,
  BookOpen,
} from "lucide-react";
import { WorkspaceNavigationLink as Link } from "./intelligence/workspace-navigation-link";
import { WorkspaceSearchForm } from "./intelligence/workspace-search-form";
import { NorthSearch, NorthCollection } from "./careos/integrated";
import { ProductArt } from "./product-art";
import { PurchaseBadge } from "./vault";
import { Button } from "./ui/button";
import { displayDate, money } from "@/lib/demo/presentation";
import type { homeLibrary, LibraryPurchase } from "@/lib/demo/library";
import {
  DOCUMENT_CATEGORIES,
  libraryHref,
  withLibraryReturn,
  type LibraryQuery,
} from "@/lib/library-navigation";
import { documentClassificationLabels } from "@/lib/document-classification";

const selectClass =
  "min-h-11 max-w-full rounded-xl border border-input bg-card px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
type Library = ReturnType<typeof homeLibrary>;

export function LibrarySearch({
  query,
  categories,
  searchIndex = [],
  purchases = [],
}: {
  query: LibraryQuery;
  categories: string[];
  searchIndex?: string[];
  purchases?: LibraryPurchase[];
}) {
  const filtered =
    query.category !== "all" ||
    query.source !== "all" ||
    query.documents !== "all" ||
    query.product !== "all" ||
    query.sort !== "newest";
  return (
    <>
      <NorthSearch
        key={libraryHref(query)}
        query={query}
        searchIndex={searchIndex}
      />
      <NorthCollection>
        <WorkspaceSearchForm
          key={libraryHref(query)}
          action={query.view === "documents" ? "/documents" : "/purchases"}
          className="my-1 sm:my-3"
        >
          <input type="hidden" name="q" value={query.q} />
          <input type="hidden" name="view" value={query.view} />
          <input
            type="hidden"
            name="documentCategory"
            value={query.documentCategory}
          />
          <details className="group min-w-0">
            <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl text-sm font-medium text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
              <SlidersHorizontal className="size-4" aria-hidden="true" />
              Filters & sort{filtered ? " · applied" : ""}
              <ChevronRight
                className="size-4 group-open:rotate-90"
                aria-hidden="true"
              />
            </summary>
            <div className="flex flex-wrap items-end gap-3 rounded-2xl border bg-card p-4">
              {query.view === "documents" && (
                <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
                  Purchase and date
                  <select
                    name="product"
                    aria-label="Purchase and date"
                    defaultValue={query.product}
                    className={`${selectClass} w-full sm:max-w-80`}
                  >
                    <option value="all">All purchases</option>
                    {purchases.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · {displayDate(p.purchasedOn)} ·{" "}
                        {p.origin === "sandbox"
                          ? "Verified Sandbox"
                          : "Example purchase"}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {query.view !== "documents" && (
                <input type="hidden" name="product" value={query.product} />
              )}
              <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
                Category
                <select
                  name="category"
                  aria-label="Category"
                  defaultValue={query.category}
                  className={selectClass}
                >
                  <option value="all">All categories</option>
                  {categories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
                Sort
                <select
                  name="sort"
                  aria-label="Sort purchases"
                  defaultValue={query.sort}
                  className={selectClass}
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="name">Product name</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Purchase source
                <select
                  name="source"
                  aria-label="Purchase source"
                  defaultValue={query.source}
                  className={selectClass}
                >
                  <option value="all">All sources</option>
                  <option value="sample">Example purchases</option>
                  <option value="sandbox">Verified Sandbox</option>
                </select>
              </label>
              <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                Saved documents
                <select
                  name="documents"
                  aria-label="Document availability"
                  defaultValue={query.documents}
                  className={selectClass}
                >
                  <option value="all">All purchases</option>
                  <option value="present">With documents</option>
                  <option value="missing">Without documents</option>
                </select>
              </label>
              <Button type="submit" variant="outline" className="self-end">
                Apply filters
              </Button>
            </div>
          </details>
          {(query.q || filtered) && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="text-muted-foreground">
                {[
                  query.q && `“${query.q}”`,
                  query.category !== "all" && query.category,
                  query.product !== "all" && "Selected purchase and date",
                  query.source !== "all" &&
                    `Purchase source: ${query.source === "sandbox" ? "Verified Sandbox" : "Example purchase"}`,
                  query.documents !== "all" &&
                    `${query.documents === "present" ? "With" : "Without"} documents`,
                  query.sort !== "newest" &&
                    (query.sort === "oldest" ? "Oldest first" : "Product name"),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              <Link
                href={query.view === "documents" ? "/documents" : "/purchases"}
                className="inline-flex min-h-11 items-center font-semibold text-primary underline underline-offset-4"
              >
                Clear filters
              </Link>
            </div>
          )}
        </WorkspaceSearchForm>
      </NorthCollection>
    </>
  );
}

export function LibraryPurchaseCard({
  purchase: p,
  from,
}: {
  purchase: LibraryPurchase;
  from: string;
}) {
  const href = withLibraryReturn(p.href, from);
  return (
    <article
      className="library-purchase-card motion-card min-w-0 rounded-2xl border bg-card p-3 shadow-card sm:p-4"
      data-purchase-card={p.id}
      data-category={p.category}
    >
      <Link
        href={href}
        className="library-product-link group relative grid grid-cols-[5rem_minmax(0,1fr)] items-center gap-3 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring sm:block"
      >
        <span className="sr-only">View details for {p.name}, </span>
        <div className="library-product-art">
          <ProductArt kind={p.illustration ?? "computer"} size="compact" />
        </div>
        <div className="min-w-0 pr-6 sm:mt-4">
          <p className="text-xs leading-5 text-muted-foreground [overflow-wrap:anywhere]">
            {p.brand} · {p.model}
          </p>
          <h2 className="mt-0.5 text-sm leading-5 font-semibold tracking-tight [overflow-wrap:anywhere] group-hover:text-primary sm:text-base sm:leading-6">
            {p.name}
          </h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm">
            <time className="text-muted-foreground" dateTime={p.purchasedOn}>
              {displayDate(p.purchasedOn)}
            </time>
            <span className="font-semibold tabular-nums">
              {p.amountMinor === null
                ? "Reference sample"
                : money(p.amountMinor)}
            </span>
          </div>
          <div className="mt-1.5 sm:mt-2">
            <PurchaseBadge origin={p.origin} />
          </div>
        </div>
        <ChevronRight
          className="absolute top-1/2 right-0 size-5 -translate-y-1/2 text-muted-foreground group-hover:text-primary sm:top-auto sm:bottom-1 sm:translate-y-0"
          aria-hidden="true"
        />
      </Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-2 border-t pt-1 text-xs sm:mt-4 sm:pt-2 sm:text-sm">
        <Link
          href={withLibraryReturn(p.href, from, "#documents")}
          className="inline-flex min-h-11 items-center gap-1.5 text-muted-foreground hover:text-primary"
        >
          <FileText className="size-4" aria-hidden="true" />
          {p.documentCount} document{p.documentCount === 1 ? "" : "s"}
          <span className="sr-only"> for {p.name}</span>
        </Link>
        {p.receiptHref ? (
          <Link
            href={withLibraryReturn(p.receiptHref, from)}
            className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-primary"
          >
            Receipt
            <ArrowRight className="size-4" aria-hidden="true" />
            <span className="sr-only">
              {" "}
              for {p.name}, {displayDate(p.purchasedOn)}
            </span>
          </Link>
        ) : (
          <Link
            href={href}
            className="inline-flex min-h-11 items-center gap-1.5 font-semibold text-primary"
          >
            View details
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        )}
      </div>
    </article>
  );
}

export function LibraryDocuments({
  items,
  from,
}: {
  items: Library["documents"];
  from: string;
}) {
  return (
    <div className="space-y-2" data-testid="library-documents">
      {items.map(({ document: d, purchase: p, classification }) => (
        <article
          key={d.id}
          className="flex flex-wrap items-center gap-3 rounded-xl border bg-card px-3 py-2 sm:px-4"
          data-document-id={d.id}
          data-document-category={classification}
        >
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-secondary">
            <FileText className="size-5 text-primary" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1 basis-48">
            <h3 className="text-sm font-semibold">
              <Link
                href={withLibraryReturn(`/documents/${d.id}`, from)}
                className="inline-flex min-h-11 items-center text-primary hover:underline"
              >
                {p.documentLinks.find(
                  (link) => link.href === `/documents/${d.id}`,
                )?.displayTitle ?? "Saved document"}
              </Link>
            </h3>
            <p className="text-sm text-muted-foreground">
              <Link
                href={withLibraryReturn(p.href, from)}
                className="hover:text-primary hover:underline"
              >
                {p.name} · {displayDate(p.purchasedOn)}
              </Link>
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {d.origin === "sandbox"
                ? "Verified Sandbox receipt"
                : "Example document"}{" "}
              · {documentClassificationLabels[classification]}
            </p>
          </div>
          <Link
            href={withLibraryReturn(`/documents/${d.id}`, from)}
            aria-label={`Open ${p.documentLinks.find((link) => link.href === `/documents/${d.id}`)?.displayTitle ?? "saved document"}, ${displayDate(p.purchasedOn)}`}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-input px-4 text-sm font-medium"
          >
            Open
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </article>
      ))}
    </div>
  );
}

export function LibraryResults({
  library,
  query,
}: {
  library: Library;
  query: LibraryQuery;
}) {
  const from = libraryHref({ ...query, page: library.page });
  return (
    <>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b pb-1 sm:mb-4 sm:pb-3">
        <p role="status" className="text-sm text-muted-foreground">
          {library.purchaseCount} purchase
          {library.purchaseCount === 1 ? "" : "s"} · {library.documentCount}{" "}
          document{library.documentCount === 1 ? "" : "s"}
          {query.q ? ` matching “${query.q}”` : ""}
          <span
            className="mt-1 block text-xs"
            data-testid="purchase-provenance-counts"
          >
            {library.provenanceCounts.sandbox} Sandbox ·{" "}
            {library.provenanceCounts.sample} examples
          </span>
        </p>
        <Link
          href={libraryHref(query, {
            view: query.view === "documents" ? "purchases" : "documents",
            documentCategory: "all",
            page: 1,
          })}
          className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-input bg-card px-3 text-sm font-semibold text-primary hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {query.view === "documents" ? (
            <>
              <ArrowLeft className="size-4" aria-hidden="true" />
              Your purchases
            </>
          ) : (
            <>
              All documents
              <ArrowRight className="size-4" aria-hidden="true" />
            </>
          )}
        </Link>
      </div>
      {query.view === "documents" && (
        <nav
          aria-label="Document categories"
          className="mb-4 flex flex-wrap gap-2"
        >
          {DOCUMENT_CATEGORIES.map(({ value, label }) => (
            <Link
              key={value}
              href={libraryHref(query, { documentCategory: value, page: 1 })}
              aria-current={
                query.documentCategory === value ? "page" : undefined
              }
              className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-sm ${query.documentCategory === value ? "border-primary bg-secondary font-semibold text-secondary-foreground" : "border-input bg-card text-muted-foreground hover:text-primary"}`}
            >
              {label}
              <span className="tabular-nums">
                {library.documentCategoryCounts[value]}
              </span>
            </Link>
          ))}
        </nav>
      )}
      {!library.valid && (
        <p role="alert" className="mb-4 rounded-xl border bg-card p-4 text-sm">
          These search or filter options aren’t supported. Clear filters to
          return to your library.
        </p>
      )}
      {!library.complete && (
        <p
          role="note"
          className="mb-4 rounded-xl border bg-card p-4 text-sm text-muted-foreground"
        >
          Showing part of your library. Search covers up to {library.limit}{" "}
          saved purchases, so some purchases and documents may be missing.
          Totals here do not cover your full purchase history.
        </p>
      )}
      {query.view !== "documents" && (
        <section aria-label="Your purchases">
          <h2 className={query.q ? "section-title mb-4" : "sr-only"}>
            {query.q ? "Matching purchases" : "Your purchases"}
          </h2>
          {library.purchases.length ? (
            <div className="library-grid">
              {library.purchases.map((p) => (
                <LibraryPurchaseCard key={p.id} purchase={p} from={from} />
              ))}
            </div>
          ) : (
            <LibraryEmpty
              documents={false}
              label={
                library.purchaseCount
                  ? "No purchases on this page"
                  : "No matching purchases"
              }
            />
          )}
        </section>
      )}
      {(query.q || query.view === "documents") && (
        <section
          aria-label="Saved documents"
          className={query.view === "documents" ? "" : "mt-8"}
        >
          <h2 className="section-title mb-4">
            {query.view === "documents"
              ? (DOCUMENT_CATEGORIES.find(
                  (c) => c.value === query.documentCategory,
                )?.label ?? "All documents")
              : "Matching documents"}
          </h2>
          {query.view === "documents" &&
            query.documentCategory === "all" &&
            library.documentCategoryCounts.other > 0 && (
              <p className="mb-3 text-xs leading-5 text-muted-foreground">
                Includes {library.documentCategoryCounts.other} other records.
                Ownership, price and delivery notes are not manuals or proof of
                warranty coverage.
              </p>
            )}
          {query.view === "documents" && query.documentCategory === "care" && (
            <p className="mb-3 text-sm leading-6 text-muted-foreground">
              These are saved care documents, not automatically supplied
              manuals. Example care cards are fictional. Official Raspberry Pi
              guidance is available in Product care, separate from this list.
            </p>
          )}
          {library.documents.length ? (
            <LibraryDocuments items={library.documents} from={from} />
          ) : (
            <LibraryEmpty
              documents={query.view === "documents"}
              label={
                library.documentCount
                  ? "No documents on this page"
                  : query.q
                    ? "No matching documents"
                    : "No saved documents"
              }
            />
          )}
        </section>
      )}
      {library.pages > 1 && (
        <nav
          aria-label="Library pages"
          className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm"
        >
          {library.page > 1 ? (
            <Link
              href={libraryHref(query, { page: library.page - 1 })}
              className="inline-flex min-h-11 items-center gap-2 font-semibold text-primary"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Previous
            </Link>
          ) : (
            <span />
          )}
          <span>
            Page {library.page} of {library.pages}
          </span>
          {library.page < library.pages ? (
            <Link
              href={libraryHref(query, { page: library.page + 1 })}
              className="inline-flex min-h-11 items-center gap-2 font-semibold text-primary"
            >
              Next
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </>
  );
}
function LibraryEmpty({
  label,
  documents,
}: {
  label: string;
  documents: boolean;
}) {
  return (
    <div className="rounded-2xl border bg-card p-6">
      <BookOpen className="mb-3 size-6 text-primary" aria-hidden="true" />
      <h3 className="font-semibold">{label}</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        {label.includes("on this page")
          ? "Use the page controls below to see the other matching records."
          : documents
            ? "No saved documents match this category and these filters. Try another category or clear the filters. Only documents already saved with a purchase appear here."
            : "Try another search or view all saved purchases. Search covers saved product and document details, not the contents of documents."}
      </p>
      <Link
        href={documents ? "/documents" : "/purchases"}
        className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary"
      >
        {documents ? "Show all documents" : "Show all purchases"}
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </div>
  );
}
