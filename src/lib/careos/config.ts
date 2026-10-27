import { z } from "zod";
import { CareError } from "./contracts";
import {
  MODEL,
  SOL_RESERVATION_MICRO,
  EVALUATION_MAX_MICRO,
} from "./model-policy";
import { SUBSCRIPTION_SESSION } from "./subscription/policy";

export function parseCareConfig(env: Record<string, string | undefined>) {
  const mode = z
    .enum(["fixture", "disabled", "responses", "subscription"])
    .safeParse(env.CAREOS_PROVIDER ?? "fixture");
  if (!mode.success) throw new CareError("careos_invalid_configuration");
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
            ["127.0.0.1", "localhost"].includes(u.hostname) &&
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
  const config = z
    .object({
      enabled: z.literal("true"),
      dataSource: z.literal("database"),
      apiKey: z.string().min(20),
      model: z.literal(MODEL),
      projectId: z.string().regex(/^proj_[a-zA-Z0-9_-]+$/),
      providerLimitConfirmed: z.literal("true"),
      baseURL: z.literal("https://api.openai.com/v1"),
      writerUrl: z
        .url()
        .refine((value) =>
          ["postgres:", "postgresql:"].includes(new URL(value).protocol),
        ),
      dailyMicro: z.coerce
        .number()
        .int()
        .min(SOL_RESERVATION_MICRO)
        .max(EVALUATION_MAX_MICRO),
      totalMicro: z.coerce
        .number()
        .int()
        .min(SOL_RESERVATION_MICRO)
        .max(EVALUATION_MAX_MICRO),
      budgetId: z.string().regex(/^[a-z0-9-]{1,40}$/),
    })
    .safeParse({
      enabled: env.CAREOS_LIVE_ENABLED,
      dataSource: env.DEMO_DATA_SOURCE,
      apiKey: env.CAREOS_API_KEY,
      model: env.CAREOS_MODEL ?? MODEL,
      projectId: env.CAREOS_PROJECT_ID,
      providerLimitConfirmed: env.CAREOS_PROVIDER_LIMIT_CONFIRMED,
      baseURL: env.CAREOS_RESPONSES_BASE_URL ?? "https://api.openai.com/v1",
      writerUrl: env.CAREOS_DATABASE_URL,
      dailyMicro: env.CAREOS_DAILY_BUDGET_MICRO,
      totalMicro: env.CAREOS_TOTAL_BUDGET_MICRO,
      budgetId: env.CAREOS_BUDGET_ID,
    });
  if (!config.success) throw new CareError("careos_live_not_authorized");
  return { mode: "responses" as const, ...config.data };
}
