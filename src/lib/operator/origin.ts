export function validOperatorOrigin(
  origin: string | undefined,
): origin is string {
  if (!origin || !URL.canParse(origin)) return false;
  const parsed = new URL(origin);
  return (
    parsed.origin === origin &&
    (parsed.protocol === "https:" ||
      (parsed.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(parsed.hostname)))
  );
}
