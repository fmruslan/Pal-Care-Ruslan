import { z } from "zod";
export const categories = ["headphones", "air-fryer"] as const;
export type DiscoveryCategory = (typeof categories)[number];
export const queries: Record<DiscoveryCategory, string> = {
  headphones: "over-ear headphones with replaceable ear cushions under $200",
  "air-fryer": "air fryer under $180",
};
export const limits: Record<DiscoveryCategory, number> = {
  headphones: 20000,
  "air-fryer": 18000,
};
export type Alternative = {
  id: string;
  title: string;
  brand: string;
  amountMinor: number | null;
  currency: "USD";
  availability: string;
  condition: string;
  retailer: string | null;
  href: string | null;
  checkedAt: string | null;
  provenance: "illustrative" | "channel3";
  reason: string;
};
export const categorySchema = z.enum(categories);
export const productIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
export function discoveryConfig(env: Record<string, string | undefined>) {
  if (env.CHANNEL3_LIVE_ENABLED !== "true") return { enabled: false as const };
  if (env.CHANNEL3_FREE_CREDITS_CONFIRMED !== "true")
    throw new Error("channel3_credit_confirmation_required");
  const result = z
    .strictObject({
      apiKey: z.string().min(10).max(500),
      budgetId: z.string().regex(/^[a-z0-9-]{1,60}$/),
      maxSearches: z.coerce.number().int().min(1).max(10),
      databaseUrl: z
        .url()
        .refine((v) =>
          ["postgres:", "postgresql:"].includes(new URL(v).protocol),
        ),
    })
    .safeParse({
      apiKey: env.CHANNEL3_API_KEY,
      budgetId: env.CHANNEL3_BUDGET_ID,
      maxSearches: env.CHANNEL3_MAX_SEARCHES,
      databaseUrl: env.DISCOVERY_DATABASE_URL,
    });
  if (!result.success) throw new Error("channel3_configuration_invalid");
  return { enabled: true as const, ...result.data };
}
