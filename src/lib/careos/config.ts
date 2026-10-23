import { z } from "zod";
import { CareError } from "./contracts";

export function parseCareConfig(env: Record<string, string | undefined>) {
  const mode = z
    .enum(["fixture", "disabled", "responses"])
    .safeParse(env.CAREOS_PROVIDER ?? "fixture");
  if (!mode.success) throw new CareError("careos_invalid_configuration");
  if (mode.data !== "responses") return { mode: mode.data } as const;
  const config = z
    .object({
      enabled: z.literal("true"),
      dataSource: z.literal("database"),
      apiKey: z.string().min(20),
      model: z.literal("gpt-5.4-mini-2026-03-17"),
      baseURL: z.literal("https://api.openai.com/v1"),
      writerUrl: z
        .url()
        .refine((value) =>
          ["postgres:", "postgresql:"].includes(new URL(value).protocol),
        ),
      dailyMicro: z.coerce.number().int().min(40000).max(5000000),
      totalMicro: z.coerce.number().int().min(40000).max(25000000),
      budgetId: z.string().regex(/^[a-z0-9-]{1,40}$/),
    })
    .safeParse({
      enabled: env.CAREOS_LIVE_ENABLED,
      dataSource: env.DEMO_DATA_SOURCE,
      apiKey: env.CAREOS_API_KEY,
      model: env.CAREOS_MODEL ?? "gpt-5.4-mini-2026-03-17",
      baseURL: env.CAREOS_RESPONSES_BASE_URL ?? "https://api.openai.com/v1",
      writerUrl: env.CAREOS_DATABASE_URL,
      dailyMicro: env.CAREOS_DAILY_BUDGET_MICRO,
      totalMicro: env.CAREOS_TOTAL_BUDGET_MICRO,
      budgetId: env.CAREOS_BUDGET_ID,
    });
  if (!config.success) throw new CareError("careos_live_not_authorized");
  return { mode: "responses" as const, ...config.data };
}
