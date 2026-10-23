import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { GuardianError, type GuardianCase } from "./contracts";
import {
  guardianRules,
  guardianTerms,
  guardianPolicyHash,
  GUARDIAN_POLICY_ID,
  GUARDIAN_PRODUCT,
  MERCHANT_ID,
  CUSTOMER_ID,
  validatePolicy,
} from "./policy";
import { eligible, type EligibilityInput } from "./eligibility";
import { transaction, counter, event } from "./database";
import { authorize } from "../operator/service";

export async function seedGuardianPolicy(client: Pick<PoolClient, "query">) {
  await client.query(
    "insert into guardian_policies(id,version,merchant_id,product_id,rules,terms,hash) values($1,$2,$3,$4,$5,$6,$7) on conflict(id) do nothing",
    [
      GUARDIAN_POLICY_ID,
      guardianRules.version,
      MERCHANT_ID,
      GUARDIAN_PRODUCT,
      JSON.stringify(guardianRules),
      guardianTerms,
      guardianPolicyHash,
    ],
  );
}
async function actionRate(client: PoolClient, actor: string) {
  await counter(
    client,
    `operator:action:${actor}:${Math.floor(Date.now() / 3600000)}`,
    1,
    30,
  );
  await counter(
    client,
    `operator:global:${Math.floor(Date.now() / 3600000)}`,
    1,
    100,
  );
}
export class GuardianService {
  constructor(public readonly pool: Pool) {}
  async publishPolicy(session: string) {
    return transaction(this.pool, async (client) => {
      const actor = await authorize(client, session, "policy:publish");
      await actionRate(client, actor);
      const row = (
        await client.query(
          "select * from guardian_policies where id=$1 for update",
          [GUARDIAN_POLICY_ID],
        )
      ).rows[0];
      if (!row || !validatePolicy(row.rules, row.terms, row.hash))
        throw new GuardianError("guardian_policy_invalid");
      if (!row.approved_at) {
        await client.query(
          "update guardian_policies set approved_at=clock_timestamp(),approved_by=$2 where id=$1",
          [GUARDIAN_POLICY_ID, actor],
        );
        await event(
          client,
          "policy:demo-price-v2",
          null,
          "policy.approved",
          actor,
          "demo-price-v2 approved for future eligible purchases only. Historical terms are unchanged.",
        );
      }
      return { version: guardianRules.version, hash: guardianPolicyHash };
    });
  }
  async publishPrice(
    session: string,
    requestId: string,
    direction: "drop" | "restore",
  ) {
    return transaction(this.pool, async (client) => {
      const actor = await authorize(client, session, "price:publish");
      const minor = direction === "drop" ? 10900 : 12900;
      await client.query("select pg_advisory_xact_lock(hashtext($1))", [
        `guardian-price:${requestId}`,
      ]);
      const prior = (
        await client.query(
          "select * from guardian_prices where request_id=$1",
          [requestId],
        )
      ).rows[0];
      if (prior) {
        if (prior.new_minor !== minor || prior.actor !== actor)
          throw new GuardianError("guardian_request_conflict");
        return prior.id as string;
      }
      await actionRate(client, actor);
      const product = (
        await client.query(
          "select * from products where id=$1 and merchant_id=$2 for update",
          [GUARDIAN_PRODUCT, MERCHANT_ID],
        )
      ).rows[0];
      if (
        !product ||
        ![12900, 10900].includes(product.price_minor) ||
        product.currency !== "USD"
      )
        throw new GuardianError("guardian_catalog_changed");
      if (product.price_minor === minor)
        throw new GuardianError("guardian_price_unchanged");
      const id = randomUUID();
      await client.query(
        "insert into guardian_prices(id,request_id,product_id,merchant_id,old_minor,new_minor,origin,actor,observed_at) values($1,$2,$3,$4,$5,$6,'controlled_demo',$7,clock_timestamp())",
        [
          id,
          requestId,
          GUARDIAN_PRODUCT,
          MERCHANT_ID,
          product.price_minor,
          minor,
          actor,
        ],
      );
      await client.query("update products set price_minor=$2 where id=$1", [
        GUARDIAN_PRODUCT,
        minor,
      ]);
      await event(
        client,
        `price:${id}`,
        null,
        "price.published",
        actor,
        `Controlled demo price published: USD ${(minor / 100).toFixed(2)}. Not PayPal-verified pricing.`,
      );
      return id;
    });
  }
  async observeCatalog() {
    await transaction(this.pool, async (client) => {
      const product = (
        await client.query(
          "select * from products where id=$1 and merchant_id=$2 for update",
          [GUARDIAN_PRODUCT, MERCHANT_ID],
        )
      ).rows[0];
      const prior = (
        await client.query(
          "select * from guardian_prices where product_id=$1 order by sequence desc limit 1",
          [GUARDIAN_PRODUCT],
        )
      ).rows[0];
      if (
        !product ||
        product.currency !== "USD" ||
        product.price_minor < 1 ||
        product.price_minor > 20000
      )
        throw new GuardianError("guardian_catalog_changed");
      if (!prior || product.price_minor !== prior.new_minor)
        await client.query(
          "insert into guardian_prices(id,request_id,product_id,merchant_id,old_minor,new_minor,origin,actor,observed_at) values(gen_random_uuid(),gen_random_uuid(),$1,$2,$3,$4,'merchant_catalog','catalog-job',clock_timestamp())",
          [
            GUARDIAN_PRODUCT,
            MERCHANT_ID,
            prior?.new_minor ?? product.price_minor,
            product.price_minor,
          ],
        );
    });
  }
  async detect() {
    await this.observeCatalog();
    let scanned = 0;
    for (let batch = 0; batch < 10; batch++) {
      const more = await transaction(this.pool, async (client) => {
        // Job lock is DB-only; finance and model calls never run in this transaction.
        await client.query(
          "select pg_advisory_xact_lock(hashtext('guardian-detect'))",
        );
        await client.query(
          "insert into guardian_checks(key) values('catalog') on conflict do nothing",
        );
        const check = (
          await client.query(
            "select * from guardian_checks where key='catalog' for update",
          )
        ).rows[0];
        const price = (
          await client.query(
            "select * from guardian_prices where product_id=$1 order by sequence desc limit 1",
            [GUARDIAN_PRODUCT],
          )
        ).rows[0];
        const rows = await client.query(
          "select t.id as twin_id,t.origin,t.product_snapshot,t.paypal_capture_id,o.id as order_id,o.policy as order_policy,o.amount_minor,o.currency,o.captured_at,o.created_at as order_created,b.bound_at,b.policy_hash,p.rules,p.terms,p.hash,p.approved_at from purchase_twins t join checkout_orders o on o.id=t.checkout_order_id join guardian_bindings b on b.checkout_order_id=o.id join guardian_policies p on p.id=b.policy_id where t.customer_id=$1 and t.merchant_id=$2 and t.product_id=$3 and o.state='completed' and t.id > coalesce($4::uuid,'00000000-0000-0000-0000-000000000000'::uuid) order by t.id limit 50",
          [CUSTOMER_ID, MERCHANT_ID, GUARDIAN_PRODUCT, check.cursor],
        );
        for (const row of rows.rows) {
          const prior = (
            await client.query(
              "select * from guardian_cases where twin_id=$1 for update",
              [row.twin_id],
            )
          ).rows[0] as GuardianCase | undefined;
          if (
            prior &&
            (
              await client.query(
                "select id from guardian_refunds where case_id=$1",
                [prior.id],
              )
            ).rowCount
          )
            continue;
          const data: EligibilityInput = {
            origin: row.origin,
            merchantId: row.product_snapshot?.merchantId,
            productId: row.product_snapshot?.id,
            brand: row.product_snapshot?.brand,
            model: row.product_snapshot?.model,
            currency: row.currency,
            originalMinor: row.amount_minor,
            quantity: 1,
            fullPrice: true,
            capturedAt: row.captured_at?.toISOString(),
            binding:
              row.order_policy.version === guardianRules.version &&
              row.policy_hash === row.hash
                ? {
                    rules: row.rules,
                    terms: row.terms,
                    hash: row.hash,
                    approvedAt: row.approved_at?.toISOString(),
                    boundAt: row.bound_at.toISOString(),
                    orderCreatedAt: row.order_created.toISOString(),
                  }
                : null,
            price: {
              merchantId: price.merchant_id,
              productId: price.product_id,
              currency: price.currency,
              minor: price.new_minor,
              previousMinor: price.old_minor,
              observedAt: price.observed_at.toISOString(),
            },
            hasPriorAdjustment: false,
            now: Date.now(),
          };
          const decision = eligible(data);
          if (!decision.eligible) {
            if (
              prior &&
              !["expired", "completed", "failed", "cancelled"].includes(
                prior.state,
              )
            ) {
              await client.query(
                "update guardian_cases set state='expired',reason=$2,revision=revision+1,updated_at=clock_timestamp() where id=$1",
                [prior.id, decision.reason],
              );
              await event(
                client,
                `case:${prior.id}:expired:${prior.revision + 1}`,
                prior.id,
                "case.expired",
                "eligibility-engine",
                decision.reason,
              );
            }
            continue;
          }
          if (!prior) {
            const id = randomUUID();
            await client.query(
              "insert into guardian_cases(id,twin_id,capture_id,policy_id,policy_hash,price_event_id,original_minor,compared_minor,amount_minor,state,reason,expires_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,'awaiting_approval','eligible',$10)",
              [
                id,
                row.twin_id,
                row.paypal_capture_id,
                GUARDIAN_POLICY_ID,
                row.hash,
                price.id,
                row.amount_minor,
                price.new_minor,
                decision.amountMinor,
                decision.expiresAt,
              ],
            );
            await event(
              client,
              `case:${id}:1`,
              id,
              "opportunity.detected",
              "eligibility-engine",
              "Eligible merchant price adjustment detected automatically; awaiting approval.",
            );
          } else if (
            prior.price_event_id !== price.id ||
            prior.state === "expired"
          ) {
            await client.query(
              "update guardian_cases set price_event_id=$2,compared_minor=$3,amount_minor=$4,revision=revision+1,state='awaiting_approval',reason='eligible',updated_at=clock_timestamp() where id=$1",
              [prior.id, price.id, price.new_minor, decision.amountMinor],
            );
            await event(
              client,
              `case:${prior.id}:${prior.revision + 1}`,
              prior.id,
              "opportunity.revised",
              "eligibility-engine",
              "Price evidence changed. Any prior approval is stale; fresh approval is required.",
            );
          }
        }
        scanned += rows.rowCount ?? 0;
        const more = rows.rows.length === 50;
        await client.query(
          "update guardian_checks set cursor=$1,last_check=clock_timestamp() where key='catalog'",
          [more ? rows.rows.at(-1)!.twin_id : null],
        );
        return more;
      });
      if (!more) break;
    }
    return { scanned };
  }
  async approve(
    session: string,
    caseId: string,
    revision: number,
    requestId: string,
  ) {
    return transaction(this.pool, async (client) => {
      const actor = await authorize(client, session, "case:approve", caseId);
      const row = (
        await client.query(
          "select * from guardian_cases where id=$1 for update",
          [caseId],
        )
      ).rows[0] as GuardianCase | undefined;
      if (!row) throw new GuardianError("guardian_not_found", 404);
      const previous = (
        await client.query(
          "select * from guardian_approvals where request_id=$1",
          [requestId],
        )
      ).rows[0];
      if (previous) {
        if (
          previous.case_id !== caseId ||
          previous.revision !== revision ||
          previous.actor !== actor
        )
          throw new GuardianError("guardian_request_conflict");
        return { id: previous.id as string };
      }
      if (
        row.revision !== revision ||
        !["awaiting_approval", "approved"].includes(row.state) ||
        row.expires_at.getTime() <= Date.now()
      )
        throw new GuardianError("guardian_approval_stale");
      const price = (
        await client.query(
          "select id from guardian_prices where product_id=$1 order by sequence desc limit 1",
          [GUARDIAN_PRODUCT],
        )
      ).rows[0];
      if (price?.id !== row.price_event_id)
        throw new GuardianError("guardian_approval_stale");
      await actionRate(client, actor);
      const id = randomUUID();
      await client.query(
        "insert into guardian_approvals(id,request_id,case_id,revision,amount_minor,policy_hash,price_event_id,actor,expires_at) values($1,$2,$3,$4,$5,$6,$7,$8,least($9,now()+interval '15 minutes'))",
        [
          id,
          requestId,
          caseId,
          revision,
          row.amount_minor,
          row.policy_hash,
          row.price_event_id,
          actor,
          row.expires_at,
        ],
      );
      await client.query(
        "update guardian_cases set state='approved',updated_at=clock_timestamp() where id=$1",
        [caseId],
      );
      await event(
        client,
        `approval:${id}`,
        caseId,
        "adjustment.approved",
        actor,
        `Merchant approved USD ${(row.amount_minor / 100).toFixed(2)} for case revision ${revision}. This is not a submitted or completed refund.`,
      );
      return { id };
    });
  }
}
