import {
  privateHttpsOrigin,
  privateHttpsPresentation,
  northReviewLivePresentation,
} from "./private-preview-origin";
import { parseCheckoutConfig } from "./commerce/config";

/** Website health only; this flag never grants model, scope or license authority. */
export function persistentPrivatePreview(
  env: Record<string, string | undefined>,
) {
  if (env.PALCARE_PERSISTENT_PREVIEW !== "true") return false;
  const checkout =
    env.PAYPAL_CHECKOUT_ENABLED === "true" &&
    env.PAYPAL_SHOWCASE_ENABLED === "true"
      ? parseCheckoutConfig(env)
      : null;
  const boundedShowcase =
    checkout?.enabled &&
    checkout.showcase &&
    env.APP_ORIGIN === privateHttpsOrigin &&
    ["127.0.0.1", "localhost"].includes(new URL(checkout.databaseUrl).hostname);
  if (
    (env.APP_ORIGIN !== "http://127.0.0.1:3002" &&
      !privateHttpsPresentation(env) &&
      !northReviewLivePresentation(env)) ||
    env.DEMO_DATA_SOURCE !== "database" ||
    env.CAREOS_PROVIDER !== "subscription" ||
    (env.PAYPAL_CHECKOUT_ENABLED !== "false" && !boundedShowcase) ||
    [
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
