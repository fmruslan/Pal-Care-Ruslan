/** Website health only; this flag never grants model, scope or license authority. */
export function persistentPrivatePreview(
  env: Record<string, string | undefined>,
) {
  if (env.PALCARE_PERSISTENT_PREVIEW !== "true") return false;
  if (
    env.APP_ORIGIN !== "http://127.0.0.1:3002" ||
    env.DEMO_DATA_SOURCE !== "database" ||
    env.CAREOS_PROVIDER !== "subscription" ||
    [
      "PAYPAL_CHECKOUT_ENABLED",
      "GUARDIAN_OPERATIONS_ENABLED",
      "GUARDIAN_REFUNDS_ENABLED",
      "GUARDIAN_PROVIDER_READS_ENABLED",
      "PRICE_GUARDIAN_CHECKOUT_ENABLED",
      "CHANNEL3_LIVE_ENABLED",
      "CPSC_REFRESH_ENABLED",
    ].some((key) => env[key] !== "false")
  )
    throw new Error("Invalid persistent private preview boundary");
  return true;
}
