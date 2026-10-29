/** Event-time guard (server authorization remains authoritative). */
export function evaluationWindowExpired(
  expiresAt: number | undefined,
  now = Date.now(),
) {
  return (
    expiresAt !== undefined && (!Number.isFinite(expiresAt) || now >= expiresAt)
  );
}
