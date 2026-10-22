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
  jsonb,
} from "drizzle-orm/pg-core";
import type {
  ProductSnapshot,
  PolicySnapshot,
  CheckoutState,
  CaptureStatus,
  PaymentMethodPreference,
} from "../lib/commerce/contracts";

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

export const checkoutOrders = pgTable(
  "checkout_orders",
  {
    id: uuid().primaryKey(),
    sessionHash: varchar("session_hash", { length: 64 }).notNull(),
    requestId: uuid("request_id").notNull().unique(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    product: jsonb().$type<ProductSnapshot>().notNull(),
    policy: jsonb().$type<PolicySnapshot>().notNull(),
    paymentMethodPreference: varchar("payment_method_preference", {
      length: 40,
    }).$type<PaymentMethodPreference>(),
    returnOrigin: text("return_origin").notNull(),
    expectedPayeeId: varchar("expected_payee_id", { length: 13 }).notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currency: varchar({ length: 3 }).notNull().default("USD"),
    state: varchar({ length: 24 })
      .$type<CheckoutState>()
      .notNull()
      .default("creating"),
    createKey: uuid("create_key").notNull().unique(),
    captureKey: uuid("capture_key").notNull().unique(),
    providerOrderId: varchar("provider_order_id", { length: 36 }).unique(),
    providerCaptureId: varchar("provider_capture_id", { length: 36 }).unique(),
    observedCaptureId: varchar("observed_capture_id", { length: 36 }).unique(),
    captureStatus: varchar("capture_status", {
      length: 20,
    }).$type<CaptureStatus>(),
    capturePendingReason: varchar("capture_pending_reason", {
      length: 20,
    }).$type<"ECHECK">(),
    captureCheckedAt: timestamp("capture_checked_at", {
      withTimezone: true,
      mode: "string",
    }),
    approvalUrl: text("approval_url"),
    captureAttemptedAt: timestamp("capture_attempted_at", {
      withTimezone: true,
      mode: "string",
    }),
    verifiedAt: timestamp("verified_at", {
      withTimezone: true,
      mode: "string",
    }),
    capturedAt: timestamp("captured_at", {
      withTimezone: true,
      mode: "string",
    }),
    lastError: varchar("last_error", { length: 40 }),
    leaseToken: uuid("lease_token"),
    leaseUntil: timestamp("lease_until", {
      withTimezone: true,
      mode: "string",
    }),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
  },
  (t) => [
    unique("checkout_session_request").on(t.sessionHash, t.requestId),
    unique("checkout_verified_identity").on(
      t.id,
      t.providerOrderId,
      t.providerCaptureId,
    ),
    check(
      "checkout_amount",
      sql`${t.amountMinor} between 1 and 20000 and ${t.currency} = 'USD'`,
    ),
    check(
      "checkout_state",
      sql`${t.state} in ('creating','create_unknown','created','capturing','pending','completed','cancelled','failed','review')`,
    ),
    check(
      "checkout_completed_evidence",
      sql`${t.state} <> 'completed' or (${t.providerOrderId} is not null and ${t.providerCaptureId} is not null and ${t.verifiedAt} is not null and ${t.capturedAt} is not null)`,
    ),
    check(
      "checkout_capture_observation",
      sql`${t.captureStatus} is null or (${t.captureStatus} in ('PENDING','COMPLETED','FAILED','DECLINED') and ${t.observedCaptureId} is not null and ${t.captureCheckedAt} is not null)`,
    ),
    check(
      "checkout_capture_pending_reason",
      sql`${t.capturePendingReason} is null or (${t.capturePendingReason} = 'ECHECK' and ${t.captureStatus} is not null and ${t.captureStatus} = 'PENDING')`,
    ),
    check(
      "checkout_capture_identity",
      sql`${t.observedCaptureId} is null or ${t.providerCaptureId} is null or ${t.observedCaptureId} = ${t.providerCaptureId}`,
    ),
    check(
      "checkout_payment_preference",
      sql`${t.paymentMethodPreference} is null or ${t.paymentMethodPreference} = 'IMMEDIATE_PAYMENT_REQUIRED'`,
    ),
  ],
);

export const checkoutRateLimits = pgTable(
  "checkout_rate_limits",
  {
    key: text().primaryKey(),
    count: integer().notNull(),
  },
  (t) => [check("checkout_rate_count", sql`${t.count} > 0`)],
);

// Sample and provider-verified provenance are separate, constrained paths.
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
    checkoutOrderId: uuid("checkout_order_id").unique(),
    paypalOrderId: varchar("paypal_order_id", { length: 36 }).unique(),
    paypalCaptureId: varchar("paypal_capture_id", { length: 36 }).unique(),
    verifiedAt: timestamp("verified_at", {
      withTimezone: true,
      mode: "string",
    }),
    productSnapshot: jsonb("product_snapshot").$type<ProductSnapshot>(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.productId, t.merchantId],
      foreignColumns: [products.id, products.merchantId],
    }),
    foreignKey({
      columns: [t.checkoutOrderId, t.paypalOrderId, t.paypalCaptureId],
      foreignColumns: [
        checkoutOrders.id,
        checkoutOrders.providerOrderId,
        checkoutOrders.providerCaptureId,
      ],
    }),
    check(
      "twin_payment_provenance",
      sql`(${t.origin} = 'sample' and ${t.checkoutOrderId} is null and ${t.paypalOrderId} is null and ${t.paypalCaptureId} is null and ${t.verifiedAt} is null and ${t.productSnapshot} is null) or (${t.origin} = 'sandbox' and ${t.checkoutOrderId} is not null and ${t.paypalOrderId} is not null and ${t.paypalCaptureId} is not null and ${t.verifiedAt} is not null and ${t.productSnapshot} is not null)`,
    ),
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
    check(
      "document_provenance",
      sql`${t.origin} in ('sample','sandbox') and (${t.origin} <> 'sandbox' or ${t.kind} = 'receipt')`,
    ),
    check(
      "document_kind",
      sql`${t.kind} in ('receipt', 'care-card', 'policy')`,
    ),
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
    check(
      "event_provenance",
      sql`${t.origin} = 'sample' or (${t.origin} = 'sandbox' and ${t.kind} = 'purchase')`,
    ),
    check(
      "care_event_kind",
      sql`${t.kind} in ('purchase', 'care', 'price', 'return')`,
    ),
    index("care_events_twin_idx").on(t.twinId),
  ],
);

export type Product = typeof products.$inferSelect;
export type CheckoutOrder = typeof checkoutOrders.$inferSelect;
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
