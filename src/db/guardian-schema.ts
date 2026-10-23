import {
  pgTable,
  uuid,
  text,
  varchar,
  integer,
  timestamp,
  jsonb,
  check,
  index,
  bigint,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { products, merchants, checkoutOrders, purchaseTwins } from "./schema";

export const operatorGrants = pgTable("operator_grants", {
  id: uuid().primaryKey(),
  codeHash: varchar("code_hash", { length: 64 }).notNull().unique(),
  actions: jsonb().$type<string[]>().notNull(),
  caseId: uuid("case_id"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});
export const operatorSessions = pgTable("operator_sessions", {
  hash: varchar({ length: 64 }).primaryKey(),
  grantId: uuid("grant_id")
    .notNull()
    .references(() => operatorGrants.id),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
export const guardianPolicies = pgTable(
  "guardian_policies",
  {
    id: uuid().primaryKey(),
    version: text().notNull().unique(),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    rules: jsonb().notNull(),
    terms: text().notNull(),
    hash: varchar({ length: 64 }).notNull(),
    approvedBy: uuid("approved_by").references(() => operatorGrants.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
  },
  (t) => [
    check(
      "guardian_policy_approval",
      sql`(${t.approvedBy} is null) = (${t.approvedAt} is null)`,
    ),
  ],
);
export const guardianBindings = pgTable("guardian_bindings", {
  checkoutOrderId: uuid("checkout_order_id")
    .primaryKey()
    .references(() => checkoutOrders.id),
  policyId: uuid("policy_id")
    .notNull()
    .references(() => guardianPolicies.id),
  policyHash: varchar("policy_hash", { length: 64 }).notNull(),
  boundAt: timestamp("bound_at", { withTimezone: true }).notNull().defaultNow(),
});
export const guardianPrices = pgTable(
  "guardian_prices",
  {
    id: uuid().primaryKey(),
    sequence: bigint({ mode: "number" })
      .generatedAlwaysAsIdentity()
      .notNull()
      .unique(),
    requestId: uuid("request_id").notNull().unique(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    merchantId: uuid("merchant_id")
      .notNull()
      .references(() => merchants.id),
    oldMinor: integer("old_minor").notNull(),
    newMinor: integer("new_minor").notNull(),
    currency: varchar({ length: 3 }).notNull().default("USD"),
    origin: text().notNull(),
    actor: text().notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      "guardian_price_bounds",
      sql`${t.oldMinor} between 1 and 20000 and ${t.newMinor} between 1 and 20000 and ${t.currency}='USD'`,
    ),
    check(
      "guardian_price_origin",
      sql`${t.origin} in ('controlled_demo','merchant_catalog')`,
    ),
    index("guardian_price_product_idx").on(t.productId, t.sequence),
  ],
);
export const guardianCases = pgTable(
  "guardian_cases",
  {
    id: uuid().primaryKey(),
    twinId: uuid("twin_id")
      .notNull()
      .unique()
      .references(() => purchaseTwins.id),
    captureId: varchar("capture_id", { length: 36 }).notNull().unique(),
    policyId: uuid("policy_id")
      .notNull()
      .references(() => guardianPolicies.id),
    policyHash: varchar("policy_hash", { length: 64 }).notNull(),
    priceEventId: uuid("price_event_id")
      .notNull()
      .references(() => guardianPrices.id),
    originalMinor: integer("original_minor").notNull(),
    comparedMinor: integer("compared_minor").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    revision: integer().notNull().default(1),
    state: text().notNull(),
    reason: text().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    leaseToken: uuid("lease_token"),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
  },
  (t) => [
    check(
      "guardian_case_amount",
      sql`${t.amountMinor} between 1 and 2000 and ${t.originalMinor} > ${t.comparedMinor} and ${t.amountMinor} <= ${t.originalMinor}-${t.comparedMinor} and ${t.revision} > 0`,
    ),
    check(
      "guardian_case_state",
      sql`${t.state} in ('awaiting_approval','approved','submitting','unknown','pending','completed','failed','cancelled','expired','review')`,
    ),
  ],
);
export const guardianApprovals = pgTable(
  "guardian_approvals",
  {
    id: uuid().primaryKey(),
    requestId: uuid("request_id").notNull().unique(),
    caseId: uuid("case_id")
      .notNull()
      .references(() => guardianCases.id),
    revision: integer().notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currency: text().notNull().default("USD"),
    policyHash: text("policy_hash").notNull(),
    priceEventId: uuid("price_event_id")
      .notNull()
      .references(() => guardianPrices.id),
    actor: uuid()
      .notNull()
      .references(() => operatorGrants.id),
    approvedAt: timestamp("approved_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    check(
      "guardian_approval_bounds",
      sql`${t.amountMinor} between 1 and 2000 and ${t.currency}='USD'`,
    ),
  ],
);
export const guardianRefunds = pgTable(
  "guardian_refunds",
  {
    id: uuid().primaryKey(),
    caseId: uuid("case_id")
      .notNull()
      .unique()
      .references(() => guardianCases.id),
    captureId: text("capture_id").notNull().unique(),
    approvalId: uuid("approval_id")
      .notNull()
      .references(() => guardianApprovals.id),
    requestKey: uuid("request_key").notNull().unique(),
    payloadHash: text("payload_hash").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    currency: text().notNull().default("USD"),
    experimentId: text("experiment_id").notNull(),
    attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull(),
    refundId: text("refund_id").unique(),
    state: text().notNull(),
    providerStatus: text("provider_status"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    checkedAt: timestamp("checked_at", { withTimezone: true }),
    recoveryObservation: text("recovery_observation"),
  },
  (t) => [
    check(
      "guardian_refund_bounds",
      sql`${t.amountMinor} between 1 and 2000 and ${t.currency}='USD'`,
    ),
    check(
      "guardian_refund_state",
      sql`${t.state} in ('submitting','unknown','pending','completed','failed','cancelled','review')`,
    ),
    check(
      "guardian_refund_completed",
      sql`${t.state}<>'completed' or (${t.refundId} is not null and ${t.providerStatus}='COMPLETED' and ${t.verifiedAt} is not null)`,
    ),
  ],
);
export const guardianEvents = pgTable(
  "guardian_events",
  {
    id: uuid().primaryKey(),
    dedupKey: text("dedup_key").notNull().unique(),
    caseId: uuid("case_id").references(() => guardianCases.id),
    kind: text().notNull(),
    actor: text().notNull(),
    detail: text().notNull(),
    refundOperationId: uuid("refund_operation_id").references(
      () => guardianRefunds.id,
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("guardian_event_case_idx").on(t.caseId)],
);
export const guardianCounters = pgTable(
  "guardian_counters",
  { key: text().primaryKey(), amount: integer().notNull() },
  (t) => [check("guardian_counter_nonnegative", sql`${t.amount} >= 0`)],
);
export const guardianChecks = pgTable("guardian_checks", {
  key: text().primaryKey(),
  cursor: uuid(),
  lastCheck: timestamp("last_check", { withTimezone: true }),
});
