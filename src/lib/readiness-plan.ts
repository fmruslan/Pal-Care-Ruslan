import { databaseUrlSchema } from "./config";
import { validAppOrigin } from "./origin";
import { runtimeWriterUrl, type DatabaseCapability } from "../db/authority";
import { parseCheckoutConfig } from "./commerce/config";
import { parseCareConfig } from "./careos/config";
import { discoveryConfig } from "./discovery/contracts";
import { refundScope } from "./commerce/refund-contracts";
import { evaluationSettings } from "./careos/evaluation-access";
import { persistentPrivatePreview } from "./private-preview";
export function readinessPlan(env: Record<string, string | undefined>) {
  if (
    env.MIGRATION_DATABASE_URL ||
    env.ADMIN_DATABASE_URL ||
    env.OPERATOR_DATABASE_URL ||
    env.LOCAL_POSTGRES_PASSWORD ||
    env.CARE_REPORTER_DATABASE_URL ||
    env.CARE_WATCH_DATABASE_URL ||
    env.CARE_PROTECTION_DATABASE_URL ||
    env.CARE_PROTECTION_WORKER_ENABLED === "true" ||
    env.CARE_HOST_WRITES_ENABLED === "true" ||
    !validAppOrigin(env.APP_ORIGIN)
  )
    throw new Error("Invalid runtime isolation/origin");
  const care = parseCareConfig(env);
  if (
    env.CARE_CONSUMER_SCENARIOS_ENABLED === "true" &&
    env.CARE_DEMO_ENABLED !== "true"
  )
    throw Error("consumer_demo_requires_saved_pack");
  if (
    !persistentPrivatePreview(env) &&
    (care.mode === "responses" || care.mode === "subscription")
  )
    evaluationSettings(env);
  if (
    env.DISCOVERY_PROVIDER &&
    !["fixture", "channel3"].includes(env.DISCOVERY_PROVIDER)
  )
    throw new Error("Invalid discovery provider");
  if (
    env.GUARDIAN_PROVIDER_READS_ENABLED === "true" ||
    env.GUARDIAN_REFUNDS_ENABLED === "true"
  ) {
    if (env.GUARDIAN_OPERATIONS_ENABLED !== "true")
      throw new Error("Financial capability requires operator configuration");
    refundScope(env); // Configuration only: no gateway construction or provider reads.
  }
  const requirements: { capability: DatabaseCapability; url: string }[] = [];
  if (env.DEMO_DATA_SOURCE === "database") {
    const reader = databaseUrlSchema.parse(env.DATABASE_URL);
    requirements.push(
      { capability: "reader", url: reader },
      {
        capability: "careos",
        url: runtimeWriterUrl("CAREOS_DATABASE_URL", env),
      },
    );
  } else if (env.DEMO_DATA_SOURCE && env.DEMO_DATA_SOURCE !== "fixtures")
    throw new Error("Invalid data source");
  if (env.CARE_RECORDS_ENABLED === "true") {
    if (env.DEMO_DATA_SOURCE !== "database")
      throw Error("Care persistence requires database mode");
    requirements.push({
      capability: "care_reader",
      url: runtimeWriterUrl("CARE_READER_DATABASE_URL", env),
    });
  }
  if (
    env.CARE_WATCH_SCHEDULE_ENABLED === "true" &&
    env.CARE_RECORDS_ENABLED !== "true"
  )
    throw Error("Watch schedule requires Care records");
  if (env.CARE_PROTECTION_ENABLED === "true") {
    if (env.DEMO_DATA_SOURCE !== "database")
      throw Error("Protection persistence requires database mode");
    requirements.push({
      capability: "protection_reader",
      url: runtimeWriterUrl("CARE_PROTECTION_READER_DATABASE_URL", env),
    });
  }
  if (env.CARE_DEMO_ENABLED === "true" && env.DEMO_DATA_SOURCE === "database") {
    requirements.push({
      capability: "demo_care_reader",
      url: runtimeWriterUrl("CARE_DEMO_READER_DATABASE_URL", env),
    });
  }
  if (
    env.CARE_PROTECTION_SCHEDULE_ENABLED === "true" &&
    env.CARE_PROTECTION_ENABLED !== "true"
  )
    throw Error("Protection schedule requires records");
  if (env.PAYPAL_CHECKOUT_ENABLED === "true") {
    const checkout = parseCheckoutConfig(env);
    if (!checkout.enabled) throw new Error("Invalid checkout configuration");
    requirements.push({
      capability: "checkout",
      url: runtimeWriterUrl("CHECKOUT_DATABASE_URL", env),
    });
  }
  if (env.GUARDIAN_OPERATIONS_ENABLED === "true") {
    if (env.DEMO_DATA_SOURCE !== "database")
      throw new Error("Guardian requires database mode");
    requirements.push({
      capability: "guardian",
      url: runtimeWriterUrl("GUARDIAN_DATABASE_URL", env),
    });
  }
  if (env.DISCOVERY_PROVIDER === "channel3") {
    const discovery = discoveryConfig(env);
    if (!discovery.enabled || env.DEMO_DATA_SOURCE !== "database")
      throw new Error("Invalid discovery configuration");
    requirements.push({
      capability: "discovery",
      url: runtimeWriterUrl("DISCOVERY_DATABASE_URL", env),
    });
  }
  return {
    requirements,
    features: {
      ...(env.CARE_DEMO_ENABLED === "true"
        ? { demoCare: "configured-simulated-and-dated-retail-evidence" }
        : {}),
      careos: care.mode,
      priceProtection:
        env.CARE_PROTECTION_ENABLED === "true"
          ? "configured-read-only-evidence-required"
          : "disabled",
      careTracking:
        env.CARE_RECORDS_ENABLED === "true"
          ? "configured-read-only"
          : "disabled",
      catalogWatches:
        env.CARE_WATCH_SCHEDULE_ENABLED === "true"
          ? "configured-check-evidence-required"
          : "disabled",
      checkout:
        env.PAYPAL_CHECKOUT_ENABLED === "true"
          ? "configured-not-provider-verified"
          : "disabled",
      guardian:
        env.GUARDIAN_OPERATIONS_ENABLED === "true"
          ? "configured-not-provider-verified"
          : "disabled",
      discovery:
        env.DISCOVERY_PROVIDER === "channel3"
          ? "configured-not-provider-verified"
          : "fixture",
    },
  };
}
