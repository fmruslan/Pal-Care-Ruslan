import { z } from "zod";

export const databaseUrlSchema = z.url().refine((value) => {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return (
    ["postgres:", "postgresql:"].includes(url.protocol) &&
    Boolean(url.hostname) &&
    url.pathname.length > 1
  );
}, "A PostgreSQL connection URL is required.");

export function parseEnvironment(env: Record<string, string | undefined>) {
  return z
    .object({
      dataSource: z.enum(["fixtures", "database"]),
      databaseUrl: databaseUrlSchema.optional(),
    })
    .superRefine((config, ctx) => {
      if (config.dataSource === "database" && !config.databaseUrl) {
        ctx.addIssue({
          code: "custom",
          path: ["databaseUrl"],
          message: "Database mode requires DATABASE_URL.",
        });
      }
    })
    .safeParse({
      dataSource: env.DEMO_DATA_SOURCE ?? "fixtures",
      databaseUrl: env.DATABASE_URL || undefined,
    });
}

export function getEnvironment() {
  if (process.env.MIGRATION_DATABASE_URL || process.env.ADMIN_DATABASE_URL)
    throw new Error(
      "Privileged database credentials must not be present in the web runtime.",
    );
  const result = parseEnvironment(process.env);
  // Never expose validation input: DATABASE_URL includes credentials.
  if (!result.success)
    throw new Error("Invalid server configuration. See docs/SETUP.md.");
  return result.data;
}
