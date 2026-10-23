import type { Pool } from "pg";
import { transaction } from "../price-guardian/database";
import { Channel3Gateway, normalizeProduct } from "./provider";
import type { DiscoveryCategory } from "./contracts";
export class DiscoveryService {
  constructor(
    private pool: Pool,
    private gateway: Channel3Gateway,
    private scope: {
      budgetId: string;
      maxSearches: number;
      restrictedWriter?: boolean;
    },
  ) {}
  private async reserve(kind: "search" | "read") {
    if (this.scope.restrictedWriter) {
      const result = await this.pool.query(
        "select bool_or(has_table_privilege(current_user,name,'INSERT,UPDATE,DELETE,TRUNCATE') or has_any_column_privilege(current_user,name,'INSERT,UPDATE')) unsafe from unnest($1::text[]) name",
        [
          [
            "checkout_orders",
            "purchase_twins",
            "documents",
            "care_events",
            "guardian_cases",
            "guardian_refunds",
            "guardian_approvals",
            "guardian_policies",
            "operator_grants",
            "operator_sessions",
            "guardian_bindings",
            "guardian_prices",
            "guardian_counters",
            "guardian_checks",
            "checkout_rate_limits",
            "products",
            "merchants",
            "demo_customers",
            "care_knowledge",
            "care_conversations",
            "care_requests",
            "care_buckets",
            "recall_sources",
            "recall_checks",
            "recall_assessments",
          ],
        ],
      );
      if (result.rows[0].unsafe !== false)
        throw new Error("discovery_writer_not_restricted");
    }
    return transaction(this.pool, async (client) => {
      const key =
        kind === "search"
          ? `search:${this.scope.budgetId}`
          : `reads:${new Date().toISOString().slice(0, 10)}`;
      const max = kind === "search" ? this.scope.maxSearches : 100;
      if (
        !Number.isSafeInteger(max) ||
        max < 1 ||
        max > (kind === "search" ? 10 : 100)
      )
        throw new Error("channel3_budget_invalid");
      const result = await client.query(
        "insert into discovery_usage(key,amount) values($1,1) on conflict(key) do update set amount=discovery_usage.amount+1 where discovery_usage.amount<$2 returning key",
        [key, max],
      );
      if (!result.rowCount) throw new Error("channel3_budget_exhausted");
    });
  }
  async discover(category: DiscoveryCategory) {
    await this.reserve("search"); // Before API dispatch; unknown/failure never releases credits or auto-retries.
    const products = await this.gateway.search(category);
    await transaction(this.pool, async (client) => {
      for (const product of products.slice(0, 3))
        await client.query(
          "insert into discovery_products(id,category) values($1,$2) on conflict(id) do nothing",
          [product.id, category],
        );
    });
    return { productIds: products.slice(0, 3).map((p) => p.id), requests: 1 };
  }
  async alternatives(category: DiscoveryCategory) {
    const rows = (
      await this.pool.query(
        "select id from discovery_products where category=$1 order by discovered_at desc,id limit 3",
        [category],
      )
    ).rows;
    const results = [];
    for (const row of rows) {
      await this.reserve("read");
      const product = await this.gateway.retrieve(row.id);
      if (product.id !== row.id) throw new Error("channel3_identity_mismatch");
      results.push(
        ...normalizeProduct(product, category, new Date().toISOString()),
      );
    }
    return results.slice(0, 6);
  }
}
