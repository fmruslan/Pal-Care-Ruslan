import type { Pool, PoolClient } from "pg";
import {
  emptyProtection,
  PROTECTION_STOP_AT,
  protectionJobSchema,
  protectionEvidenceSchema,
  protectionNotificationSchema,
} from "./contracts";
import {
  discoverProtectionPolicy,
  evidenceHash,
  protectionInputSchema,
  qualifyingProtectionDrop,
  validProtectionCatalog,
  type ProtectionInput,
} from "./model";
import { z } from "zod";

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : v);
export function protectionInput(row: Record<string, unknown>): ProtectionInput {
  return protectionInputSchema.parse({
    twinId: row.twin_id,
    merchantId: row.merchant_id,
    productId: row.product_id,
    origin: row.origin,
    originalMinor: row.purchase_price_minor,
    currency: row.currency,
    brand: row.brand,
    model: row.model,
    verifiedAt: iso(row.verified_at),
    capturedAt: iso(row.captured_at),
    orderCreatedAt: iso(row.order_created_at),
    boundAt: iso(row.bound_at),
    bindingHash: row.binding_hash,
    policyHash: row.policy_hash,
    policyVersion: row.policy_version,
    policyRules: row.policy_rules,
    policyTerms: row.policy_terms,
    approvedAt: iso(row.approved_at),
    policyDocuments: row.policy_documents,
    catalogBrand: row.catalog_brand,
    catalogModel: row.catalog_model,
    catalogMinor: row.catalog_minor,
    catalogCurrency: row.catalog_currency,
    hasPriorAdjustment: row.has_prior_adjustment,
  });
}
function evidence(row: Record<string, unknown>) {
  return protectionEvidenceSchema.parse({
    id: row.id,
    twinId: row.twin_id,
    kind: row.kind,
    source: row.source,
    sourceUrl: row.source_url,
    retrievedAt: iso(row.retrieved_at),
    facts: row.facts,
    contentHash: row.content_hash,
  });
}
export async function readProtection(pool: Pool, twinId?: string) {
  if (twinId !== undefined) z.uuid().parse(twinId);
  const client = await pool.connect();
  try {
    await client.query("begin isolation level repeatable read read only");
    const data = emptyProtection(),
      inputs: ProtectionInput[] = [];
    const scoped = [twinId ?? null];
    const rows = await client.query(
      "select * from care_protection_inputs where ($1::uuid is null or twin_id=$1) order by twin_id limit 1001",
      scoped,
    );
    data.complete = rows.rows.length <= 1000;
    for (const row of rows.rows.slice(0, 1000)) {
      try {
        inputs.push(protectionInput(row));
      } catch {
        data.complete = false;
      }
    }
    const jobs = await client.query(
      "select * from care_protection_jobs where ($1::uuid is null or twin_id=$1) order by twin_id limit 1001",
      scoped,
    );
    data.complete &&= jobs.rows.length <= 1000;
    for (const row of jobs.rows.slice(0, 1000)) {
      const parsed = protectionJobSchema.safeParse({
        twinId: row.twin_id,
        state: row.state,
        createdAt: iso(row.created_at),
        nextCheckAt: iso(row.next_check_at),
        lastCheckedAt: iso(row.last_checked_at),
        checks: row.checks,
      });
      if (parsed.success) data.jobs.push(parsed.data);
      else data.complete = false;
    }
    const facts = await client.query(
      "select * from care_protection_evidence where ($1::uuid is null or twin_id=$1) order by retrieved_at desc,id desc limit 1001",
      scoped,
    );
    data.complete &&= facts.rows.length <= 1000;
    for (const row of facts.rows.slice(0, 1000)) {
      try {
        data.evidence.push(evidence(row));
      } catch {
        data.complete = false;
      }
    }
    const notices = await client.query(
      "select * from care_protection_notifications where ($1::uuid is null or twin_id=$1) order by created_at desc,id desc limit 1001",
      scoped,
    );
    data.complete &&= notices.rows.length <= 1000;
    for (const row of notices.rows.slice(0, 1000)) {
      const parsed = protectionNotificationSchema.safeParse({
        id: row.id,
        twinId: row.twin_id,
        evidenceId: row.evidence_id,
        kind: row.kind,
        createdAt: iso(row.created_at),
      });
      if (parsed.success) data.notifications.push(parsed.data);
      else data.complete = false;
    }
    await client.query("commit");
    return { saved: data, inputs };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
async function append(
  client: PoolClient,
  input: ProtectionInput,
  kind: "policy" | "catalog" | "unavailable",
  sourceUrl: string,
  facts: Record<string, unknown>,
  key: string,
) {
  const row = (
    await client.query(
      "insert into care_protection_evidence(twin_id,kind,source,source_url,facts,content_hash,dedup_key) values($1,$2,$3,$4,$5,$6,$7) on conflict(twin_id,dedup_key) do nothing returning *",
      [
        input.twinId,
        kind,
        kind === "policy"
          ? "purchase-policy"
          : kind === "catalog"
            ? "forma-catalog"
            : "unavailable",
        sourceUrl,
        facts,
        evidenceHash(facts),
        key,
      ],
    )
  ).rows[0];
  const saved =
    row ??
    (
      await client.query(
        "select * from care_protection_evidence where twin_id=$1 and dedup_key=$2",
        [input.twinId, key],
      )
    ).rows[0];
  if (!saved || saved.content_hash !== evidenceHash(facts))
    throw Error("protection_evidence_conflict");
  return evidence(saved);
}
/** Bounded DB-only discovery/checking. No model, HTTP, purchase or financial writer. */
export async function runProtectionChecks(pool: Pool) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const locked = (
      await client.query("select pg_try_advisory_xact_lock(61422,2) as locked")
    ).rows[0].locked;
    if (!locked) {
      await client.query("commit");
      return { checked: 0, discovered: 0, notifications: 0, locked: true };
    }
    const now = new Date(
      (await client.query("select now() as now")).rows[0].now,
    );
    if (now.getTime() >= Date.parse(PROTECTION_STOP_AT)) {
      await client.query("commit");
      return { checked: 0, discovered: 0, notifications: 0, stopped: true };
    }
    const selected = (
      await client.query(
        "select i.twin_id from care_protection_inputs i left join care_protection_jobs j on j.twin_id=i.twin_id where j.twin_id is null or (j.state in ('queued','supported','error') and j.next_check_at<=now() and (j.last_checked_at is null or j.last_checked_at<=now()-interval '1 day')) order by coalesce(j.next_check_at,i.purchase_recorded_at),i.twin_id limit 50",
      )
    ).rows.map((row) => row.twin_id as string);
    const discovered =
      (
        await client.query(
          "insert into care_protection_jobs(twin_id) select unnest($1::uuid[]) on conflict(twin_id) do nothing",
          [selected],
        )
      ).rowCount ?? 0;
    const rows = (
      await client.query(
        "select i.*,j.checks from care_protection_jobs j join care_protection_inputs i on i.twin_id=j.twin_id where j.twin_id=any($1::uuid[]) and j.state in ('queued','supported','error') and j.next_check_at<=now() and (j.last_checked_at is null or j.last_checked_at<=now()-interval '1 day') order by j.next_check_at,j.twin_id limit 50 for update of j",
        [selected],
      )
    ).rows;
    let notifications = 0;
    for (const row of rows) {
      const input = protectionInput(row),
        policy = discoverProtectionPolicy(input, now);
      if (!policy.verified || input.hasPriorAdjustment) {
        const reason = !policy.verified
          ? policy.reason
          : "An adjustment is already recorded; no second opportunity is created.";
        await append(
          client,
          input,
          "unavailable",
          input.policyDocuments.length === 1
            ? `/documents/${input.policyDocuments[0].id}`
            : `/care/${input.twinId}#price`,
          { version: "protection-unavailable-v1", reason },
          "unavailable-v1",
        );
        await client.query(
          "update care_protection_jobs set state='unavailable',last_checked_at=now(),checks=checks+1 where twin_id=$1",
          [input.twinId],
        );
        continue;
      }
      const source = await append(
        client,
        input,
        "policy",
        policy.sourceUrl,
        policy.facts,
        `policy:${input.policyHash}`,
      );
      if (Date.parse(policy.deadline) <= now.getTime()) {
        await client.query(
          "update care_protection_jobs set state='expired',last_checked_at=now(),checks=checks+1 where twin_id=$1",
          [input.twinId],
        );
        continue;
      }
      if (
        input.catalogBrand !== input.brand ||
        input.catalogModel !== input.model ||
        input.catalogCurrency !== "USD" ||
        !Number.isSafeInteger(input.catalogMinor) ||
        input.catalogMinor < 1 ||
        input.catalogMinor > 20000
      ) {
        await append(
          client,
          input,
          "unavailable",
          `/care/${input.twinId}#price`,
          {
            version: "protection-unavailable-v1",
            reason:
              "The supported exact-product catalog source could not be verified. Monitoring is not active.",
          },
          `catalog-error:${row.checks}`,
        );
        await client.query(
          "update care_protection_jobs set state='error',next_check_at=now()+interval '1 day',checks=checks+1 where twin_id=$1",
          [input.twinId],
        );
        continue;
      }
      const priorRow = (
        await client.query(
          "select * from care_protection_evidence where twin_id=$1 and kind='catalog' order by retrieved_at desc,id desc limit 1",
          [input.twinId],
        )
      ).rows[0];
      const prior = priorRow ? evidence(priorRow) : undefined;
      if (prior && !validProtectionCatalog(prior))
        throw Error("protection_catalog_evidence_invalid");
      const current = await append(
        client,
        input,
        "catalog",
        "/shop",
        {
          version: "protection-catalog-v1",
          merchantId: input.merchantId,
          productId: input.productId,
          brand: input.brand,
          model: input.model,
          currency: "USD",
          minor: input.catalogMinor,
          priorId: prior?.id ?? null,
        },
        `catalog:${row.checks}`,
      );
      const drop = qualifyingProtectionDrop(input, current, prior, now);
      if (drop?.eligible)
        notifications +=
          (
            await client.query(
              "insert into care_protection_notifications(twin_id,evidence_id,kind) values($1,$2,'opportunity') on conflict do nothing",
              [input.twinId, current.id],
            )
          ).rowCount ?? 0;
      if (Date.parse(policy.deadline) - now.getTime() <= 48 * 3600000)
        notifications +=
          (
            await client.query(
              "insert into care_protection_notifications(twin_id,evidence_id,kind) values($1,$2,'window-ending') on conflict do nothing",
              [input.twinId, source.id],
            )
          ).rowCount ?? 0;
      await client.query(
        "update care_protection_jobs set state='supported',last_checked_at=now(),next_check_at=least(now()+interval '1 day',$2::timestamptz),checks=checks+1 where twin_id=$1",
        [input.twinId, policy.deadline],
      );
    }
    await client.query("commit");
    return { checked: rows.length, discovered, notifications, locked: false };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
