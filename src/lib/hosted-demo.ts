import { validAppOrigin } from "./origin";

/** Explicit Render-only configuration. Never enables a private/Sol runtime. */
export function hostedDemo(env: Record<string, string | undefined>) {
  if (
    env.PALCARE_HOSTED_DEMO !== "true" ||
    env.RENDER !== "true" ||
    !validAppOrigin(env.APP_ORIGIN)
  )
    return false;
  const origin = new URL(env.APP_ORIGIN);
  return (
    origin.protocol === "https:" &&
    origin.hostname.endsWith(".onrender.com") &&
    env.CAREOS_PROVIDER === "responses" &&
    env.CAREOS_MODEL === "deepseek-flash" &&
    ![
      "PALCARE_PERSISTENT_PREVIEW",
      "PALCARE_PRIVATE_HTTPS_PREVIEW",
      "CAREOS_OWNER_MODE",
      "CAREOS_STANDING_AI_ENABLED",
      "CAREOS_SUBSCRIPTION_ENABLED",
      "CAREOS_OWNER_PAIRING_ENABLED",
      "PAYPAL_CHECKOUT_ENABLED",
      "GUARDIAN_OPERATIONS_ENABLED",
      "GUARDIAN_REFUNDS_ENABLED",
      "GUARDIAN_PROVIDER_READS_ENABLED",
    ].some((key) => env[key] === "true")
  );
}
