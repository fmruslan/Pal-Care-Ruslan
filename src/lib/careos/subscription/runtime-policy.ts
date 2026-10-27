export function restrictedRuntimeUrls(
  source: Record<string, string | undefined>,
) {
  try {
    const reader = source.DATABASE_URL,
      careos = source.CAREOS_DATABASE_URL;
    if (source.DEMO_DATA_SOURCE !== "database" || !reader || !careos)
      throw new Error();
    for (const value of [reader, careos]) {
      const url = new URL(value);
      if (
        !["postgres:", "postgresql:"].includes(url.protocol) ||
        !["127.0.0.1", "localhost"].includes(url.hostname)
      )
        throw new Error();
    }
    return { reader, careos };
  } catch {
    throw new Error("subscription_runtime_configuration_invalid");
  }
}
