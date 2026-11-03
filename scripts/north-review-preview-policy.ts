import { restrictedRuntimeUrls } from "../src/lib/careos/subscription/runtime-policy";
import { northReviewOrigin } from "../src/lib/private-preview-origin";
import { z } from "zod";
import { SUBSCRIPTION_SESSION } from "../src/lib/careos/subscription/policy";

const reviewBuild = z.strictObject({
  commit: z.string().regex(/^[a-f0-9]{40}$/),
  buildId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  dirty: z.boolean(),
});

/** Presentation + fixed fictional records only. No token/grant migration,
 * owner/provider credentials, fixture AI, financial flags or admin URLs. */
export function northReviewEnvironment(
  source: Record<string, string | undefined>,
  build?: z.infer<typeof reviewBuild>,
) {
  const urls = restrictedRuntimeUrls(source);
  // Public identity only, supplied by the launcher after snapshot verification.
  // Not inherited from arbitrary source environment and never an AI grant.
  const identity = build ? reviewBuild.parse(build) : null;
  return {
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
    APP_ORIGIN: northReviewOrigin,
    PALCARE_NORTH_REVIEW_PREVIEW: "true",
    PALCARE_PERSISTENT_PREVIEW: "false",
    PALCARE_PRIVATE_HTTPS_PREVIEW: "false",
    DEMO_DATA_SOURCE: "database",
    DATABASE_URL: urls.reader,
    CAREOS_DATABASE_URL: urls.careos,
    CAREOS_PROVIDER: "disabled",
    CAREOS_OWNER_MODE: "false",
    CAREOS_STANDING_AI_ENABLED: "false",
    CAREOS_SUBSCRIPTION_ENABLED: "false",
    CAREOS_EVALUATION_ENABLED: "false",
    CAREOS_OWNER_PAIRING_ENABLED: "false",
    CAREOS_LIVE_ENABLED: "false",
    PAYPAL_CHECKOUT_ENABLED: "false",
    GUARDIAN_OPERATIONS_ENABLED: "false",
    GUARDIAN_REFUNDS_ENABLED: "false",
    GUARDIAN_PROVIDER_READS_ENABLED: "false",
    PRICE_GUARDIAN_CHECKOUT_ENABLED: "false",
    DISCOVERY_PROVIDER: "fixture",
    CHANNEL3_LIVE_ENABLED: "false",
    CPSC_REFRESH_ENABLED: "false",
    AG_STUDIO_LOCAL_EVALUATION_ENABLED: "false",
    AG_STUDIO_PRIVATE_DEVELOPMENT_ENABLED: "true",
    PALCARE_NORTH_REVIEW_COMMIT: identity?.commit ?? "",
    PALCARE_NORTH_REVIEW_BUILD_ID: identity?.buildId ?? "",
    PALCARE_NORTH_REVIEW_SOURCE_HASH: identity?.sourceHash ?? "",
    PALCARE_NORTH_REVIEW_DIRTY: identity ? String(identity.dirty) : "",
  };
}

/** Activated only by the owner-approved launcher after checking the additional
 * exact-origin approval against the ORIGINAL policy. Same ledger, no new cap. */
export function northLiveReviewEnvironment(
  source: Record<string, string | undefined>,
  build?: z.infer<typeof reviewBuild>,
) {
  return {
    ...northReviewEnvironment(source, build),
    PALCARE_PERSISTENT_PREVIEW: "true",
    CAREOS_NORTH_LIVE_REVIEW_ENABLED: "true",
    CAREOS_PROVIDER: "subscription",
    CAREOS_OWNER_MODE: "true",
    CAREOS_STANDING_AI_ENABLED: "true",
    CAREOS_SUBSCRIPTION_ENABLED: "true",
    CAREOS_SUBSCRIPTION_CREDITS_DISABLED: "true",
    CAREOS_SUBSCRIPTION_SESSION_ID: SUBSCRIPTION_SESSION,
    CAREOS_MODEL: "gpt-6.1-sol",
  };
}
