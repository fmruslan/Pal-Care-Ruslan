import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local", quiet: true });
export default defineConfig({
  dialect: "postgresql",
  schema: [
    "./src/db/schema.ts",
    "./src/db/careos-schema.ts",
    "./src/db/guardian-schema.ts",
  ],
  out: "./drizzle",
});
