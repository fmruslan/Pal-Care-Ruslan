import {
  pgTable,
  text,
  timestamp,
  jsonb,
  uuid,
  unique,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { purchaseTwins } from "./schema";
import type { RecallSource } from "../lib/safety/cpsc";
export const recallSources = pgTable(
  "recall_sources",
  {
    hash: text().primaryKey(),
    recallNumber: text("recall_number").notNull(),
    source: jsonb().$type<RecallSource>().notNull(),
    retrievedAt: timestamp("retrieved_at", { withTimezone: true }).notNull(),
    endpoint: text().notNull(),
  },
  (t) => [check("recall_hash_shape", sql`${t.hash} ~ '^[a-f0-9]{64}$'`)],
);
export const recallChecks = pgTable(
  "recall_checks",
  {
    key: text().primaryKey(),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull(),
    state: text().notNull(),
    sourceHash: text("source_hash").references(() => recallSources.hash),
  },
  (t) => [
    check("recall_check_state", sql`${t.state} in ('available','unavailable')`),
  ],
);
export const recallAssessments = pgTable(
  "recall_assessments",
  {
    id: uuid().primaryKey(),
    twinId: uuid("twin_id")
      .notNull()
      .references(() => purchaseTwins.id),
    sourceHash: text("source_hash")
      .notNull()
      .references(() => recallSources.hash),
    engineVersion: text("engine_version").notNull(),
    state: text().notNull(),
    reason: text().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("recall_assessment_once").on(
      t.twinId,
      t.sourceHash,
      t.engineVersion,
    ),
    check(
      "recall_assessment_state",
      sql`${t.state} in ('not_assessed','possible_match','identifiers_match','more_information','no_match')`,
    ),
  ],
);
