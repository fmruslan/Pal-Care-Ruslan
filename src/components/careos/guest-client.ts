// A hosted-only marker is emitted by the server. Private runtimes do nothing.
// Coalesce concurrent North/Studio admission; never retry an inference request.
let admission: Promise<void> | undefined;
export async function ensureGuestAccess() {
  if (
    typeof document === "undefined" ||
    !document.querySelector('meta[name="palcare-hosted-guest"]')
  )
    return;
  admission ??= fetch("/api/ai/evaluation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
    cache: "no-store",
    signal: AbortSignal.timeout(15000),
  })
    .then((response) => {
      if (!response.ok) throw new Error("guest_access_unavailable");
    })
    .catch((error: unknown) => {
      admission = undefined;
      throw error;
    });
  try {
    await admission;
  } finally {
    admission = undefined;
  }
}
