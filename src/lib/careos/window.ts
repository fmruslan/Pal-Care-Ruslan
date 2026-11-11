/** Event-time guard (server authorization remains authoritative). */
export function evaluationWindowExpired(
  expiresAt: number | undefined,
  now = Date.now(),
) {
  return (
    expiresAt !== undefined && (!Number.isFinite(expiresAt) || now >= expiresAt)
  );
}

/** Browsers clamp overflowing setTimeout delays to 1ms; hosted access can last weeks. */
export function evaluationRefreshDelay(expiresAt: number, now = Date.now()) {
  return Math.min(2147483647, Math.max(0, expiresAt - now + 50));
}
