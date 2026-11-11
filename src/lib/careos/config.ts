import { z } from "zod";
import { CareError } from "./contracts";
import {
  MODEL,
  SOL_RESERVATION_MICRO,
  EVALUATION_MAX_MICRO,
} from "./model-policy";
import { SUBSCRIPTION_SESSION } from "./subscription/policy";
import { hostedDemo } from "../hosted-demo";
import {
  privateHttpsPresentation,
  northReviewLivePresentation,
} from "../private-preview-origin";

export function parseCareConfig(env: Record<string, string | undefined>) {
  const mode = z
    .enum(["fixture", "disabled", "responses", "subscription"])
    .safeParse(env.CAREOS_PROVIDER ?? "fixture");
  if (!mode.success) throw new CareError("careos_invalid_configuration");
  if (env.PALCARE_HOSTED_DEMO === "true" && !hostedDemo(env))
    throw new CareError("careos_hosted_configuration_invalid");
  if (mode.data === "subscription") {
    const c = z
      .object({
        enabled: z.literal("true"),
        dataSource: z.literal("database"),
        creditsDisabled: z.literal("true"),
        sessionId: z.literal(SUBSCRIPTION_SESSION),
        model: z.literal(MODEL),
        origin: z.url().refine((v) => {
          const u = new URL(v);
          return (
            (["127.0.0.1", "localhost"].includes(u.hostname) ||
              ((privateHttpsPresentation(env) ||
                northReviewLivePresentation(env)) &&
                env.CAREOS_EVALUATION_ENABLED === "false" &&
                env.CAREOS_OWNER_PAIRING_ENABLED === "false")) &&
            ["http:", "https:"].includes(u.protocol) &&
            u.origin === v
          );
        }),
      })
      .safeParse({
        enabled: env.CAREOS_SUBSCRIPTION_ENABLED,
        dataSource: env.DEMO_DATA_SOURCE,
        creditsDisabled: env.CAREOS_SUBSCRIPTION_CREDITS_DISABLED,
        sessionId: env.CAREOS_SUBSCRIPTION_SESSION_ID,
        model: env.CAREOS_MODEL ?? MODEL,
        origin: env.APP_ORIGIN,
      });
    if (!c.success) throw new CareError("careos_subscription_not_authorized");
    return { mode: "subscription" as const, ...c.data };
  }
  if (mode.data !== "responses") return { mode: mode.data } as const;
  const hosted = hostedDemo(env);
  const config = z
    .object({
      enabled: z.literal("true"),
      dataSource: z.literal("database"),
      apiKey: z.string().min(20),
      model: hosted ? z.literal("deepseek-flash") : z.literal(MODEL),
      projectId: hosted
        ? z.undefined()
        : z.string().regex(/^proj_[a-zA-Z0-9_-]+$/),
      providerLimitConfirmed: z.literal("true"),
      baseURL: hosted
        ? z.literal("https://api.deepseek.com")
        : z.literal("https://api.openai.com/v1"),
      writerUrl: z
        .url()
        .refine((value) =>
          ["postgres:", "postgresql:"].includes(new URL(value).protocol),
        ),
      dailyMicro: z.coerce
        .number()
        .int()
        .min(SOL_RESERVATION_MICRO)
        .max(hosted ? 18000000 : EVALUATION_MAX_MICRO),
      totalMicro: z.coerce
        .number()
        .int()
        .min(SOL_RESERVATION_MICRO)
        .max(hosted ? 18000000 : EVALUATION_MAX_MICRO),
      budgetId: z.string().regex(/^[a-z0-9-]{1,40}$/),
    })
    .safeParse({
      enabled: env.CAREOS_LIVE_ENABLED,
      dataSource: env.DEMO_DATA_SOURCE,
      apiKey: env.CAREOS_API_KEY,
      model: env.CAREOS_MODEL ?? MODEL,
      projectId: hosted ? undefined : env.CAREOS_PROJECT_ID,
      providerLimitConfirmed: env.CAREOS_PROVIDER_LIMIT_CONFIRMED,
      baseURL:
        env.CAREOS_RESPONSES_BASE_URL ??
        (hosted ? "https://api.deepseek.com" : "https://api.openai.com/v1"),
      writerUrl: env.CAREOS_DATABASE_URL,
      // Upgrade only the original hosted $5 configuration to the owner-approved
      // $18 ceiling, leaving $2 of the stated $20 credits outside the app cap.
      // Keep the original budget ID, all charges/unknowns and explicit lower caps.
      dailyMicro:
        hosted && env.CAREOS_DAILY_BUDGET_MICRO === "5000000"
          ? "18000000"
          : env.CAREOS_DAILY_BUDGET_MICRO,
      totalMicro:
        hosted && env.CAREOS_TOTAL_BUDGET_MICRO === "5000000"
          ? "18000000"
          : env.CAREOS_TOTAL_BUDGET_MICRO,
      budgetId: env.CAREOS_BUDGET_ID,
    });
  if (!config.success) throw new CareError("careos_live_not_authorized");
  return { mode: "responses" as const, ...config.data };
}
