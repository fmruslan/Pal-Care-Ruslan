import { config } from "dotenv";
import { databaseUrlSchema } from "../src/lib/config";

config({ path: ".env.local", quiet: true });
export function databaseUrl() {
  const parsed = databaseUrlSchema.safeParse(process.env.DATABASE_URL);
  if (!parsed.success)
    throw new Error(
      "Configure DATABASE_URL in .env.local or the server environment.",
    );
  return parsed.data;
}
