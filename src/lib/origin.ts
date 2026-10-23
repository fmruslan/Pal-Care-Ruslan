/** Exact configured origin, never derived from an untrusted Host header. */
export function validAppOrigin(value: string | undefined): value is string {
  if (!value || !URL.canParse(value)) return false;
  const url = new URL(value);
  return (
    url.origin === value &&
    !url.username &&
    !url.password &&
    (url.protocol === "https:" ||
      (url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname)))
  );
}
