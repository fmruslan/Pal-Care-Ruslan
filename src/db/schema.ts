import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  varchar,
  integer,
  text,
  timestamp,
  date,
  check,
  index,
  foreignKey,
  unique,
} from "drizzle-orm/pg-core";

export const customers = pgTable(
  "demo_customers",
  {
    id: uuid().primaryKey(),
    name: varchar({ length: 80 }).notNull(),
    kind: varchar({ length: 16 }).notNull().default("fictional"),
  },
  (t) => [check("fictional_customer_only", sql`${t.kind} = 'fictional'`)],
);

export const merchants = pgTable(
  "merchants",
  {
    id: uuid().primaryKey(),
    name: varchar({ length: 120 }).notNull(),
    kind: varchar({ length: 16 }).notNull().default("fictional"),
  },
  (t) => [check("fictional_merchant_only", sql`${t.kind} = 'fictional'`)],
);

export const products = pgTable(
  "products",
  {
    id: uuid().primaryKey(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id),
    name: varchar({ length: 120 }).notNull(),
    brand: varchar({ length: 80 }).notNull(),
    model: varchar({ length: 80 }).notNull(),
    category: varchar({ length: 40 }).notNull(),
    illustration: varchar({ length: 20 }).notNull(),
    priceMinor: integer("price_minor").notNull(),
    currency: varchar({ length: 3 }).notNull().default("USD"),
  },
  (t) => [
    check("catalog_nonnegative_price", sql`${t.priceMinor} >= 0`),
    check("catalog_usd_only", sql`${t.currency} = 'USD'`),
    unique("product_merchant_identity").on(t.id, t.merchantId),
  ],
);

// Sample twins cannot be confused with provider-verified payments. Stage 2 must
// introduce verified capture references and a new migration before writing sandbox twins.
export const purchaseTwins = pgTable(
  "purchase_twins",
  {
    id: uuid().primaryKey(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id),
    productId: uuid("product_id").notNull(),
    purchasedOn: date("purchased_on", { mode: "string" }).notNull(),
    purchasePriceMinor: integer("purchase_price_minor").notNull(),
    currency: varchar({ length: 3 }).notNull().default("USD"),
    origin: varchar({ length: 16 }).notNull().default("sample"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.productId, t.merchantId],
      foreignColumns: [products.id, products.merchantId],
    }),
    check("sample_twins_only", sql`${t.origin} = 'sample'`),
    check("purchase_nonnegative_price", sql`${t.purchasePriceMinor} >= 0`),
    check("purchase_usd_only", sql`${t.currency} = 'USD'`),
    index("twins_customer_idx").on(t.customerId),
    index("twins_merchant_idx").on(t.merchantId),
  ],
);

export const documents = pgTable(
  "documents",
  {
    id: uuid().primaryKey(),
    twinId: uuid("twin_id")
      .notNull()
      .references(() => purchaseTwins.id),
    title: varchar({ length: 120 }).notNull(),
    kind: varchar({ length: 20 }).notNull(),
    content: text().notNull(),
    origin: varchar({ length: 16 }).notNull().default("sample"),
  },
  (t) => [
    check("sample_documents_only", sql`${t.origin} = 'sample'`),
    check("document_kind", sql`${t.kind} in ('receipt', 'care-card')`),
    check("document_size", sql`length(${t.content}) between 1 and 20000`),
    index("documents_twin_idx").on(t.twinId),
  ],
);

export const careEvents = pgTable(
  "care_events",
  {
    id: uuid().primaryKey(),
    twinId: uuid("twin_id")
      .notNull()
      .references(() => purchaseTwins.id),
    kind: varchar({ length: 24 }).notNull(),
    title: varchar({ length: 120 }).notNull(),
    description: text().notNull(),
    occurredOn: date("occurred_on", { mode: "string" }).notNull(),
    origin: varchar({ length: 16 }).notNull().default("sample"),
  },
  (t) => [
    check("sample_events_only", sql`${t.origin} = 'sample'`),
    check(
      "care_event_kind",
      sql`${t.kind} in ('purchase', 'care', 'price', 'return')`,
    ),
    index("care_events_twin_idx").on(t.twinId),
  ],
);

export type Product = typeof products.$inferSelect;
export type PurchaseTwin = typeof purchaseTwins.$inferSelect;
export type CareDocument = typeof documents.$inferSelect;
export type CareEvent = typeof careEvents.$inferSelect;
export type DemoData = {
  customer: typeof customers.$inferSelect;
  merchant: typeof merchants.$inferSelect;
  products: Product[];
  twins: PurchaseTwin[];
  documents: CareDocument[];
  events: CareEvent[];
};
