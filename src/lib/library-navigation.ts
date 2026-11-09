/** Presentation-only, bounded URL state. Never an identity or authorization. */
export type LibraryParams = Record<string, string | string[] | undefined>;
export const DOCUMENT_CATEGORIES = [
  { value: "receipts", label: "Receipts" },
  { value: "warranties", label: "Warranties & coverage" },
  { value: "care", label: "Care guides & manuals" },
  { value: "returns", label: "Returns & policies" },
  { value: "all", label: "All documents" },
] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number]["value"];
export type LibraryQuery = {
  q: string;
  category: string;
  source: "all" | "sample" | "sandbox";
  documents: "all" | "present" | "missing";
  sort: "newest" | "oldest" | "name";
  view: "purchases" | "documents";
  documentCategory: DocumentCategory;
  /** Exact dated Purchase Twin, not a product/model grouping. */
  product: string;
  page: number;
  valid: boolean;
};

export function parseLibraryQuery(params: LibraryParams): LibraryQuery {
  let valid = true;
  const scalar = (key: string, fallback: string, max = 40) => {
    const value = params[key];
    if (value === undefined) return fallback;
    if (typeof value !== "string" || value.length > max) {
      valid = false;
      return fallback;
    }
    return value;
  };
  const choice = <T extends string>(key: string, values: readonly T[]): T => {
    const value = scalar(key, values[0]);
    if (values.includes(value as T)) return value as T;
    valid = false;
    return values[0];
  };
  const pageText = scalar("page", "1", 4);
  const page = /^\d{1,4}$/.test(pageText) ? Number(pageText) : 0;
  if (page < 1 || page > 1000) valid = false;
  const result = {
    q: scalar("q", "", 128).trim(),
    category: scalar("category", "all"),
    source: choice("source", ["all", "sample", "sandbox"] as const),
    documents: choice("documents", ["all", "present", "missing"] as const),
    sort: choice("sort", ["newest", "oldest", "name"] as const),
    view: choice("view", ["purchases", "documents"] as const),
    documentCategory: choice("documentCategory", [
      "all",
      "receipts",
      "warranties",
      "care",
      "returns",
    ] as const),
    product: scalar("product", "all"),
    page: Math.max(1, page),
    valid,
  };
  if (
    result.product !== "all" &&
    !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(
      result.product,
    )
  )
    valid = false;
  return { ...result, valid };
}

export function libraryHref(
  query: LibraryQuery,
  change: Partial<LibraryQuery> = {},
) {
  const value = { ...query, ...change };
  const params = new URLSearchParams();
  for (const [key, item, fallback] of [
    ["q", value.q, ""],
    ["category", value.category, "all"],
    ["source", value.source, "all"],
    ["documents", value.documents, "all"],
    ["sort", value.sort, "newest"],
    ["documentCategory", value.documentCategory, "all"],
    ["product", value.product, "all"],
    ["page", String(value.page), "1"],
  ])
    if (item !== fallback) params.set(key, item);
  return `${value.view === "documents" ? "/documents" : "/purchases"}${params.size ? `?${params}` : ""}`;
}

export function libraryReturn(value: string | string[] | undefined) {
  if (typeof value !== "string" || value.length > 1024) return "/purchases";
  try {
    const url = new URL(value, "https://palcare.invalid");
    if (
      url.origin !== "https://palcare.invalid" ||
      !["/dashboard", "/purchases", "/documents"].includes(url.pathname)
    )
      return "/purchases";
    const params: LibraryParams = {};
    for (const key of url.searchParams.keys()) {
      const values = url.searchParams.getAll(key);
      params[key] = values.length === 1 ? values[0] : values;
    }
    const query = parseLibraryQuery(
      url.pathname === "/documents" ? { ...params, view: "documents" } : params,
    );
    return query.valid ? libraryHref(query) : "/purchases";
  } catch {
    return "/purchases";
  }
}

export function withLibraryReturn(path: string, from: string, hash = "") {
  const safe = libraryReturn(from);
  return `${path}${safe === "/purchases" ? "" : `?from=${encodeURIComponent(safe)}`}${hash}`;
}
