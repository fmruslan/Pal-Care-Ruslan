import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { z } from "zod";
import type { Pool, PoolClient } from "pg";
import { CUSTOMER_ID, MERCHANT_ID } from "../demo/fixtures";
import { GUARDIAN_PRODUCT } from "../price-guardian/policy";
import {
  careEvidenceSchema,
  returnMilestoneSchema,
  warrantySchema,
} from "./contracts";

export const manualReturnSchema = z.strictObject({
  caseId: z.uuid(),
  twinId: z.uuid(),
  reference: z.string().min(1).max(200),
  effectiveOn: z.iso.date(),
  state: returnMilestoneSchema.shape.state,
});
export const manualWarrantySchema = z.strictObject({
  caseId: z.uuid(),
  twinId: z.uuid(),
  reference: z.string().min(1).max(200),
  effectiveOn: z.iso.date(),
  expiresOn: z.iso.date(),
  basis: z.string().min(1).max(500),
});
export const watchRequestSchema = z.strictObject({
  id: z.uuid(),
  twinId: z.uuid(),
  expiresAt: z.iso.datetime({ offset: true }),
});
export type SavedWatch = {
  id: string;
  twinId: string;
  state: "saved" | "active" | "paused" | "error" | "expired";
  lastCheckedAt: string | null;
  nextCheckAt: string | null;
  observedMinor: number | null;
  expiresAt: string;
};
export type SavedCare = {
  returns: z.infer<typeof returnMilestoneSchema>[];
  warranties: z.infer<typeof warrantySchema>[];
  watches: SavedWatch[];
  complete: boolean;
};
export const emptySavedCare = (): SavedCare => ({
  returns: [],
  warranties: [],
  watches: [],
  complete: true,
});

async function transaction<T>(
  pool: Pool,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const result = await work(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

/** Must receive the separately inspected reporter pool. There is no HTTP writer. */
export async function appendManualCare(
  pool: Pool,
  kind: "return" | "warranty",
  value: unknown,
) {
  const input =
    kind === "return"
      ? manualReturnSchema.parse(value)
      : manualWarrantySchema.parse(value);
  return transaction(pool, async (client) => {
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `care-case:${input.caseId}`,
    ]);
    const scoped = await client.query(
      "select id from purchase_twins where id=$1 and customer_id=$2 and merchant_id=$3",
      [input.twinId, CUSTOMER_ID, MERCHANT_ID],
    );
    if (scoped.rowCount !== 1) throw Error("care_purchase_not_found");
    await client.query(
      "insert into care_cases(id,twin_id,kind) values($1,$2,$3) on conflict(id) do nothing",
      [input.caseId, input.twinId, kind],
    );
    const existing = (
      await client.query("select twin_id,kind from care_cases where id=$1", [
        input.caseId,
      ])
    ).rows[0];
    if (existing?.twin_id !== input.twinId || existing.kind !== kind)
      throw Error("care_case_scope_mismatch");
    const prior = (
      await client.query(
        "select id,state,effective_on::text as effective_on,facts from care_case_events where case_id=$1 and source_kind='manual' and source_reference=$2",
        [input.caseId, input.reference],
      )
    ).rows[0];
    const state = "state" in input ? input.state : "warranty_terms";
    const facts =
      "expiresOn" in input
        ? { expiresOn: input.expiresOn, basis: input.basis }
        : {};
    if (prior) {
      const date =
        typeof prior.effective_on === "string"
          ? prior.effective_on
          : prior.effective_on.toISOString().slice(0, 10);
      if (
        prior.state !== state ||
        date !== input.effectiveOn ||
        !isDeepStrictEqual(prior.facts, facts)
      )
        throw Error("care_reference_conflict");
      return { id: prior.id as string, repeated: true };
    }
    const revision = Number(
      (
        await client.query(
          "select coalesce(max(revision),0)+1 as revision from care_case_events where case_id=$1",
          [input.caseId],
        )
      ).rows[0].revision,
    );
    const id = randomUUID();
    await client.query(
      "insert into care_case_events(id,case_id,twin_id,revision,state,source_reference,effective_on,facts) values($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        id,
        input.caseId,
        input.twinId,
        revision,
        state,
        input.reference,
        input.effectiveOn,
        facts,
      ],
    );
    return { id, repeated: false };
  });
}

export async function saveWatch(pool: Pool, value: unknown) {
  const input = watchRequestSchema.parse(value);
  // RLS additionally restricts the only supported fixed fictional catalog SKU.
  await pool.query(
    "insert into care_watches(id,twin_id,expires_at) values($1,$2,$3) on conflict(twin_id) do nothing",
    [input.id, input.twinId, input.expiresAt],
  );
  const row = (
    await pool.query(
      "select id,state,expires_at from care_watches where twin_id=$1",
      [input.twinId],
    )
  ).rows[0];
  if (!row) throw Error("care_watch_not_saved");
  return { id: row.id as string, state: row.state as string };
}

/** Reversible operational pause; never resets lifetime, source or usage. */
export async function pauseWatches(pool: Pool, paused: boolean, id?: string) {
  if (id) z.uuid().parse(id);
  const result = await pool.query(
    "update care_watches set state=$1 where ($2::uuid is null or id=$2) and expires_at>now() and state=any($3::varchar[])",
    [
      paused ? "paused" : "saved",
      id ?? null,
      paused ? ["saved", "active", "error"] : ["paused"],
    ],
  );
  return result.rowCount ?? 0;
}

/** Database-only bounded catalog checker. No model/provider/commerce dependency. */
export async function checkDueWatches(pool: Pool) {
  return transaction(pool, async (client) => {
    const locked = (
      await client.query("select pg_try_advisory_xact_lock(61422,1) as locked")
    ).rows[0].locked;
    if (!locked) return { checked: 0, locked: true };
    const rows = (
      await client.query(
        "select w.id,p.price_minor,w.expires_at<=now() as expired from care_watches w join purchase_twins t on t.id=w.twin_id join products p on p.id=t.product_id and p.merchant_id=t.merchant_id where t.customer_id=$1 and t.merchant_id=$2 and p.id=$3 and p.currency='USD' and w.state in ('saved','active','error') and (w.expires_at<=now() or w.next_check_at is null or w.next_check_at<=now()) order by w.next_check_at nulls first,w.id limit 50 for update of w",
        [CUSTOMER_ID, MERCHANT_ID, GUARDIAN_PRODUCT],
      )
    ).rows;
    for (const row of rows) {
      if (row.expired) {
        await client.query(
          "update care_watches set state='expired' where id=$1",
          [row.id],
        );
      } else if (
        !Number.isSafeInteger(row.price_minor) ||
        row.price_minor <= 0 ||
        row.price_minor > 20000
      ) {
        await client.query(
          "update care_watches set state='error',next_check_at=now()+interval '1 day' where id=$1",
          [row.id],
        );
      } else
        await client.query(
          "update care_watches set state='active',observed_minor=$2,last_checked_at=now(),next_check_at=now()+interval '1 day' where id=$1",
          [row.id, row.price_minor],
        );
    }
    return { checked: rows.length, locked: false };
  });
}

/** Read-only, bounded and strict. Unparseable evidence never becomes a fact. */
export async function readSavedCare(
  pool: Pool,
  twinId?: string,
): Promise<SavedCare> {
  if (twinId !== undefined) z.uuid().parse(twinId);
  const result = emptySavedCare();
  const rows = (
    await pool.query(
      "select e.*,e.effective_on::text as effective_date,c.kind from care_case_events e join care_cases c on c.id=e.case_id and c.twin_id=e.twin_id join purchase_twins t on t.id=e.twin_id where t.customer_id=$1 and t.merchant_id=$2 and ($3::uuid is null or t.id=$3) order by e.recorded_at desc,e.id desc limit 1001",
      [CUSTOMER_ID, MERCHANT_ID, twinId ?? null],
    )
  ).rows;
  const watchRows = (
    await pool.query(
      "select w.* from care_watches w join purchase_twins t on t.id=w.twin_id where t.customer_id=$1 and t.merchant_id=$2 and ($3::uuid is null or t.id=$3) order by w.created_at desc,w.id desc limit 1001",
      [CUSTOMER_ID, MERCHANT_ID, twinId ?? null],
    )
  ).rows;
  result.complete = rows.length <= 1000 && watchRows.length <= 1000;
  const latestWarranty = new Map<string, z.infer<typeof warrantySchema>>();
  for (const row of rows.slice(0, 1000).reverse()) {
    const evidence = careEvidenceSchema.safeParse({
      kind: row.source_kind,
      reference: row.source_reference,
      recordedAt: row.recorded_at.toISOString(),
      effectiveOn: row.effective_date,
      href: `/vault/${row.twin_id}`,
    });
    if (!evidence.success) {
      result.complete = false;
      continue;
    }
    const parsed =
      row.kind === "return"
        ? returnMilestoneSchema.safeParse({
            id: row.id,
            twinId: row.twin_id,
            caseId: row.case_id,
            state: row.state,
            evidence: evidence.data,
          })
        : warrantySchema.safeParse({
            twinId: row.twin_id,
            evidence: evidence.data,
            expiresOn: row.facts.expiresOn,
            basis: row.facts.basis,
          });
    if (!parsed.success) {
      result.complete = false;
      continue;
    }
    if ("state" in parsed.data) result.returns.push(parsed.data);
    else latestWarranty.set(row.case_id, parsed.data);
  }
  const conflicts = new Set(
    [...latestWarranty.values()]
      .filter((r) =>
        [...latestWarranty.values()].some(
          (other) =>
            other.twinId === r.twinId &&
            (other.expiresOn !== r.expiresOn || other.basis !== r.basis),
        ),
      )
      .map((r) => r.twinId),
  );
  if (conflicts.size) result.complete = false;
  result.warranties = [
    ...new Map(
      [...latestWarranty.values()]
        .filter((r) => !conflicts.has(r.twinId))
        .map((r) => [r.twinId, r]),
    ).values(),
  ];
  result.watches = watchRows.slice(0, 1000).map((r) => ({
    id: r.id,
    twinId: r.twin_id,
    state: r.state,
    lastCheckedAt: r.last_checked_at?.toISOString() ?? null,
    nextCheckAt: r.next_check_at?.toISOString() ?? null,
    observedMinor: r.observed_minor,
    expiresAt: r.expires_at.toISOString(),
  }));
  return result;
}
