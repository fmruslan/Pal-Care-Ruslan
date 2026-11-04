/** Presentation-only metadata matching, not an AI intent parser or permission. */
export function metadataWords(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/** Literal catalog/document terms use ordinary search. Everything else is sent
 * unchanged through the existing authorized conversational model, never commands. */
export function isLiteralLibrarySearch(value: string, index: string[]) {
  if (!value.trim() || value.length > 128) return false;
  const words = metadataWords(value);
  return (
    words.length > 0 &&
    index.some((text) => {
      const saved = new Set(metadataWords(text));
      return words.every((word) => saved.has(word));
    })
  );
}

export const northWorkspaceKey = "palcare-north-workspace-v1";
export function readNorthWorkspace(raw: string | null) {
  if (!raw || raw.length > 256) return null;
  try {
    const v: unknown = JSON.parse(raw);
    if (
      !v ||
      typeof v !== "object" ||
      !("version" in v) ||
      v.version !== 1 ||
      !("id" in v) ||
      !("open" in v) ||
      typeof v.open !== "boolean" ||
      ("historySelected" in v && typeof v.historySelected !== "boolean") ||
      !(
        v.id === null ||
        (typeof v.id === "string" && /^[a-f0-9-]{36}$/.test(v.id))
      )
    )
      return null;
    // An active result is display state, not proof that the customer selected
    // its history scope. Legacy hints default to the explicit purchase context.
    const historySelected =
      "historySelected" in v && v.historySelected === true;
    if (historySelected && v.id === null) return null;
    return {
      version: 1 as const,
      id: v.id as string | null,
      open: v.open,
      historySelected,
    };
  } catch {
    return null;
  }
}

export function documentPreviewId(href: string) {
  return (
    /^\/documents\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/.exec(
      href,
    )?.[1] ?? null
  );
}
