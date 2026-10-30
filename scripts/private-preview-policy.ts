import { createHash } from "node:crypto";
import { z } from "zod";
import {
  sessionSchema,
  SUBSCRIPTION_SESSION,
} from "../src/lib/careos/subscription/session";
import { restrictedRuntimeUrls } from "../src/lib/careos/subscription/runtime-policy";
import { privateHttpsOrigin } from "../src/lib/private-preview-origin";

export const previewOrigin = "http://127.0.0.1:3002";

export function previewExitCode(
  code: number | null,
  signal: string | null,
  stopping: boolean,
) {
  return stopping ? 0 : signal ? 1 : (code ?? 1);
}
const application = z.strictObject({
  origin: z.literal(previewOrigin),
  customer: z.string().regex(/^[a-f0-9]{64}$/),
  studio: z.string().regex(/^[a-f0-9]{64}$/),
  expiresAt: z.number().int().positive(),
});

/** Read existing authority only. Never create/renew a session, grant or manifest. */
export function privatePreviewEnvironment(
  source: Record<string, string | undefined>,
  appRecord: unknown,
  sessionRecord: unknown,
) {
  const urls = restrictedRuntimeUrls(source);
  const app = application.safeParse(appRecord);
  const session = sessionSchema.safeParse(sessionRecord);
  const valid =
    app.success &&
    session.success &&
    app.data.expiresAt === session.data.expiresAt &&
    app.data.customer !== app.data.studio;
  const hash = (s: string) => createHash("sha256").update(s).digest("hex");
  // Invalid/missing authority stays subscription-mode but permanently denied.
  // Never silently substitute scripted AI or create replacement capabilities.
  return {
    NODE_ENV: "production" as const,
    NEXT_TELEMETRY_DISABLED: "1",
    APP_ORIGIN: privateHttpsOrigin,
    PALCARE_PERSISTENT_PREVIEW: "true",
    PALCARE_PRIVATE_HTTPS_PREVIEW: "true",
    DEMO_DATA_SOURCE: "database",
    DATABASE_URL: urls.reader,
    CAREOS_DATABASE_URL: urls.careos,
    CAREOS_PROVIDER: "subscription",
    CAREOS_MODEL: "gpt-6.1-sol",
    CAREOS_SUBSCRIPTION_ENABLED: "true",
    CAREOS_SUBSCRIPTION_CREDITS_DISABLED: "true",
    CAREOS_SUBSCRIPTION_SESSION_ID: SUBSCRIPTION_SESSION,
    // Existing localhost grants are NOT migrated to the new HTTPS origin.
    CAREOS_EVALUATION_ENABLED: "false",
    CAREOS_OWNER_PAIRING_ENABLED: "false",
    // Remembered identity is independent of inference permission. No policy is
    // provisioned here; live activation needs a separate reviewed change.
    CAREOS_OWNER_MODE: "true",
    CAREOS_STANDING_AI_ENABLED: "false",
    CAREOS_EVALUATION_EXPIRES_AT: valid
      ? new Date(app.data.expiresAt).toISOString()
      : "",
    CAREOS_CUSTOMER_ACCESS_HASH: valid
      ? hash(app.data.customer)
      : "0".repeat(64),
    CAREOS_STUDIO_ACCESS_HASH: valid ? hash(app.data.studio) : "1".repeat(64),
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
  };
}
