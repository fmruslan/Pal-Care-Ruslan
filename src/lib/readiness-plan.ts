import { databaseUrlSchema } from "./config";
import { validAppOrigin } from "./origin";
import { runtimeWriterUrl, type DatabaseCapability } from "../db/authority";
import { parseCheckoutConfig } from "./commerce/config";
import { parseCareConfig } from "./careos/config";
import { discoveryConfig } from "./discovery/contracts";
import { refundScope } from "./commerce/refund-contracts";
import { evaluationSettings } from "./careos/evaluation-access";
export function readinessPlan(env: Record<string, string | undefined>) {
  if (
    env.MIGRATION_DATABASE_URL ||
    env.ADMIN_DATABASE_URL ||
    env.OPERATOR_DATABASE_URL ||
    env.LOCAL_POSTGRES_PASSWORD ||
    !validAppOrigin(env.APP_ORIGIN)
  )
    throw new Error("Invalid runtime isolation/origin");
  const care = parseCareConfig(env);
  if (care.mode === "responses" || care.mode === "subscription")
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
      careos: care.mode,
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
