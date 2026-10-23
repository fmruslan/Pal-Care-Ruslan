import { pgTable, text, integer, timestamp, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
export const discoveryUsage = pgTable(
  "discovery_usage",
  { key: text().primaryKey(), amount: integer().notNull() },
  (t) => [check("discovery_positive_budget", sql`${t.amount}>0`)],
);
export const discoveryProducts = pgTable(
  "discovery_products",
  {
    id: text().primaryKey(),
    category: text().notNull(),
    discoveredAt: timestamp("discovered_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "discovery_category",
      sql`${t.category} in ('headphones','air-fryer')`,
    ),
  ],
);
