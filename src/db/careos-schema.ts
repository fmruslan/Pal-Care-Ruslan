import {
  pgTable,
  uuid,
  text,
  varchar,
  date,
  jsonb,
  check,
  index,
  timestamp,
  integer,
  primaryKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { products } from "./schema";
import type { CareTurn } from "../lib/careos/contracts";

export const careConversations = pgTable(
  "care_conversations",
  {
    id: uuid().primaryKey(),
    owner: varchar({ length: 64 }).notNull(),
    expiresAt: timestamp("expires_at", {
      withTimezone: true,
      mode: "string",
    }).notNull(),
    pendingId: uuid("pending_id"),
    pendingUntil: timestamp("pending_until", {
      withTimezone: true,
      mode: "string",
    }),
  },
  (t) => [
    index("care_conversation_owner_idx").on(t.owner),
    index("care_conversation_expiry_idx").on(t.expiresAt),
  ],
);

export const careRequests = pgTable(
  "care_requests",
  {
    id: uuid().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => careConversations.id, { onDelete: "cascade" }),
    fingerprint: varchar({ length: 64 }).notNull(),
    result: jsonb().$type<CareTurn>(),
    reservedMicro: integer("reserved_micro").notNull().default(0),
    actualMicro: integer("actual_micro"),
    providerCalls: integer("provider_calls").notNull().default(0),
    settledCalls: integer("settled_calls").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "string" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("care_request_conversation_idx").on(t.conversationId),
    check(
      "care_request_nonnegative",
      sql`${t.reservedMicro} >= 0 and ${t.providerCalls} between 0 and 2 and (${t.actualMicro} is null or ${t.actualMicro} >= 0)`,
    ),
  ],
);

export const careBuckets = pgTable(
  "care_buckets",
  {
    key: text().primaryKey(),
    amount: integer().notNull(),
  },
  (t) => [check("care_bucket_nonnegative", sql`${t.amount} >= 0`)],
);

// Per-call identity survives process restarts; transcript deletion never releases buckets.
export const careModelCalls = pgTable(
  "care_model_calls",
  {
    requestId: uuid("request_id")
      .notNull()
      .references(() => careRequests.id, { onDelete: "cascade" }),
    call: integer().notNull(),
    reservedMicro: integer("reserved_micro").notNull(),
    bucketKeys: jsonb("bucket_keys").$type<string[]>().notNull(),
    actualMicro: integer("actual_micro"),
    settledAt: timestamp("settled_at", { withTimezone: true }),
  },
  (t) => [
    primaryKey({ columns: [t.requestId, t.call] }),
    check(
      "care_call_bounds",
      sql`${t.call} between 1 and 2 and ${t.reservedMicro}=40000 and (${t.actualMicro} is null or ${t.actualMicro} between 0 and ${t.reservedMicro}) and ((${t.actualMicro} is null) = (${t.settledAt} is null))`,
    ),
  ],
);

export const careKnowledge = pgTable(
  "care_knowledge",
  {
    id: uuid().primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    brand: varchar({ length: 80 }).notNull(),
    model: varchar({ length: 80 }).notNull(),
    publisher: varchar({ length: 120 }).notNull(),
    title: varchar({ length: 160 }).notNull(),
    url: text().notNull(),
    section: varchar({ length: 160 }).notNull(),
    revision: varchar({ length: 80 }).notNull(),
    reviewedOn: date("reviewed_on", { mode: "string" }).notNull(),
    content: text().notNull(),
    contentHash: varchar("content_hash", { length: 64 }).notNull(),
    status: varchar({ length: 20 }).notNull(),
    language: varchar({ length: 8 }).notNull(),
    license: varchar({ length: 40 }).notNull(),
    tags: jsonb().$type<string[]>().notNull(),
  },
  (t) => [
    check(
      "care_source_status",
      sql`${t.status} in ('approved','conflicting','withdrawn')`,
    ),
    check("care_source_size", sql`length(${t.content}) between 1 and 4000`),
    index("care_source_product_idx").on(t.productId),
  ],
);
