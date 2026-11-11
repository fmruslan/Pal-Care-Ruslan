export const privateHttpsOrigin = "https://greatbison.tail9e8802.ts.net:8444";
export const northReviewOrigin = "https://greatbison.tail9e8802.ts.net:8445";

/** Owner-approved main-site presentation. This flag grants no model access:
 * original 8444 browser proof, policy and shared accounting still gate dispatch. */
export function northMainLivePresentation(
  env: Record<string, string | undefined>,
) {
  return (
    privateHttpsPresentation(env) &&
    env.PALCARE_NORTH_MAIN_ENABLED === "true" &&
    env.CAREOS_PROVIDER === "subscription" &&
    env.CAREOS_OWNER_MODE === "true" &&
    env.CAREOS_STANDING_AI_ENABLED === "true" &&
    env.CAREOS_SUBSCRIPTION_ENABLED === "true" &&
    env.CAREOS_SUBSCRIPTION_CREDITS_DISABLED === "true" &&
    env.CAREOS_EVALUATION_ENABLED === "false" &&
    env.CAREOS_OWNER_PAIRING_ENABLED === "false"
  );
}

export function northConversationalPresentation(
  env: Record<string, string | undefined>,
) {
  return (
    northMainLivePresentation(env) ||
    northReviewLivePresentation(env) ||
    hostedDemo(env)
  );
}

/** Configuration is presentation only. Dispatch additionally requires the
 * host-private approval bound to the existing standing policy/accounting. */
export function northReviewLivePresentation(
  env: Record<string, string | undefined>,
) {
  return (
    env.PALCARE_NORTH_REVIEW_PREVIEW === "true" &&
    env.APP_ORIGIN === northReviewOrigin &&
    env.CAREOS_NORTH_LIVE_REVIEW_ENABLED === "true" &&
    env.CAREOS_PROVIDER === "subscription" &&
    env.CAREOS_OWNER_MODE === "true" &&
    env.CAREOS_STANDING_AI_ENABLED === "true" &&
    env.CAREOS_SUBSCRIPTION_ENABLED === "true" &&
    env.CAREOS_SUBSCRIPTION_CREDITS_DISABLED === "true" &&
    env.CAREOS_EVALUATION_ENABLED === "false" &&
    env.CAREOS_OWNER_PAIRING_ENABLED === "false"
  );
}

/** Separate owner-requested presentation only. Never accepted by the standing
 * AI origin/policy; all inference and pairing stay explicitly disabled. */
export function northReviewPresentation(
  env: Record<string, string | undefined>,
) {
  return (
    northReviewLivePresentation(env) ||
    (env.PALCARE_NORTH_REVIEW_PREVIEW === "true" &&
      env.APP_ORIGIN === northReviewOrigin &&
      env.CAREOS_PROVIDER === "disabled" &&
      env.CAREOS_OWNER_MODE === "false" &&
      env.CAREOS_STANDING_AI_ENABLED === "false" &&
      env.CAREOS_EVALUATION_ENABLED === "false" &&
      env.CAREOS_OWNER_PAIRING_ENABLED === "false")
  );
}

/** Explicit presentation configuration, never identity, scope or model authority.
 * Neither Host nor X-Forwarded-* can turn this on. No wildcard tailnet trust.
 */
export function privateHttpsPresentation(
  env: Record<string, string | undefined>,
) {
  return (
    env.PALCARE_PERSISTENT_PREVIEW === "true" &&
    env.PALCARE_PRIVATE_HTTPS_PREVIEW === "true" &&
    env.APP_ORIGIN === privateHttpsOrigin
  );
}
import { hostedDemo } from "./hosted-demo";
