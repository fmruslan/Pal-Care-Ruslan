import type { Pool, PoolClient } from "pg";

// One policy per capability, never one all-powerful application role.
export type DatabaseCapability =
  "reader" | "careos" | "checkout" | "guardian" | "discovery" | "recall";
type Grants = Record<string, string[]>;
export const runtimeGrants: Record<DatabaseCapability, Grants> = {
  reader: {},
  careos: Object.fromEntries(
    [
      "care_conversations",
      "care_requests",
      "care_buckets",
      "care_model_calls",
    ].map((t) => [t, ["INSERT", "UPDATE", "DELETE"]]),
  ),
  checkout: {
    checkout_orders: ["INSERT", "UPDATE"],
    checkout_rate_limits: ["INSERT", "UPDATE"],
    purchase_twins: ["INSERT"],
    documents: ["INSERT"],
    care_events: ["INSERT"],
    guardian_bindings: ["INSERT"],
  },
  guardian: {
    products: ["UPDATE:price_minor"],
    guardian_policies: ["UPDATE:approved_at", "UPDATE:approved_by"],
    operator_grants: ["UPDATE:used_at"],
    ...Object.fromEntries(
      [
        "operator_sessions",
        "guardian_cases",
        "guardian_refunds",
        "guardian_counters",
        "guardian_checks",
      ].map((t) => [t, ["INSERT", "UPDATE"]]),
    ),
    ...Object.fromEntries(
      ["guardian_prices", "guardian_approvals", "guardian_events"].map((t) => [
        t,
        ["INSERT"],
      ]),
    ),
  },
  discovery: {
    discovery_usage: ["INSERT", "UPDATE"],
    discovery_products: ["INSERT"],
  },
  recall: {
    recall_sources: ["INSERT"],
    recall_assessments: ["INSERT"],
    recall_checks: ["INSERT", "UPDATE"],
  },
};
export const runtimeReads: Record<DatabaseCapability, string[]> = {
  reader: [
    "demo_customers",
    "merchants",
    "products",
    "purchase_twins",
    "documents",
    "care_events",
    "care_knowledge",
    "guardian_cases",
    "guardian_policies",
    "guardian_prices",
    "guardian_refunds",
    "guardian_approvals",
    "guardian_events",
    "guardian_checks",
    "recall_sources",
    "recall_checks",
    "recall_assessments",
  ],
  careos: [
    "care_conversations",
    "care_requests",
    "care_buckets",
    "care_model_calls",
  ],
  checkout: [
    "products",
    "merchants",
    "checkout_orders",
    "checkout_rate_limits",
    "purchase_twins",
    "guardian_policies",
    "guardian_bindings",
  ],
  guardian: [
    "checkout_orders",
    "purchase_twins",
    "documents",
    "care_events",
    "products",
    "merchants",
    "guardian_bindings",
    "guardian_policies",
    "operator_grants",
    "operator_sessions",
    "guardian_cases",
    "guardian_refunds",
    "guardian_counters",
    "guardian_checks",
    "guardian_prices",
    "guardian_approvals",
    "guardian_events",
  ],
  discovery: ["discovery_products", "discovery_usage"],
  recall: [
    "purchase_twins",
    "recall_sources",
    "recall_checks",
    "recall_assessments",
  ],
};

export class DatabaseAuthorityError extends Error {
  constructor() {
    super("runtime_database_authority_invalid");
  }
}

/** Inspects effective, login AND assumable identities. No write probe on application data. */
export async function assertDatabaseAuthority(
  client: Pick<Pool | PoolClient, "query">,
  capability: DatabaseCapability,
) {
  const roles =
    await client.query(`select oid,rolname,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls
    from pg_roles where rolname=current_user or rolname=session_user or pg_has_role(session_user,oid,'SET')`);
  if (
    !roles.rowCount ||
    roles.rows.some(
      (r) =>
        r.rolsuper ||
        r.rolcreatedb ||
        r.rolcreaterole ||
        r.rolreplication ||
        r.rolbypassrls,
    )
  )
    throw new DatabaseAuthorityError();
  const names = roles.rows.map((r) => r.rolname as string);
  const structure = await client.query(
    `select exists(
    select 1 from pg_namespace n where n.nspname in ('public','drizzle') and
      (n.nspowner=any($1::oid[]) or exists(select 1 from unnest($2::text[]) r where has_schema_privilege(r,n.oid,'CREATE')))
    union all select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','drizzle') and c.relowner=any($1::oid[])
    union all select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','drizzle') and
      (p.proowner=any($1::oid[]) or (p.prosecdef and exists(select 1 from unnest($2::text[]) r where has_function_privilege(r,p.oid,'EXECUTE'))))
    ) unsafe`,
    [roles.rows.map((r) => r.oid), names],
  );
  if (structure.rows[0].unsafe) throw new DatabaseAuthorityError();
  const privileges = await client.query(
    `select c.relname,a.attname,p.privilege,
    bool_or(case when a.attname is null then has_table_privilege(r,c.oid,p.privilege)
      else has_column_privilege(r,c.oid,a.attnum,p.privilege) end) allowed
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    cross join unnest($1::text[]) r
    cross join (values('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('TRIGGER'),('REFERENCES')) p(privilege)
    left join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped and p.privilege in ('INSERT','UPDATE')
    where n.nspname in ('public','drizzle') and c.relkind in ('r','p','v','m','f')
    group by c.relname,a.attname,p.privilege`,
    [names],
  );
  const policy = runtimeGrants[capability];
  for (const row of privileges.rows) {
    if (!row.allowed) continue;
    const permitted = policy[row.relname] ?? [];
    if (
      !permitted.includes(row.privilege) &&
      !permitted.includes(`${row.privilege}:${row.attname}`)
    )
      throw new DatabaseAuthorityError();
  }
}

export function runtimeWriterUrl(
  name: string,
  env: Record<string, string | undefined> = process.env,
) {
  if (env.MIGRATION_DATABASE_URL || env.ADMIN_DATABASE_URL)
    throw new DatabaseAuthorityError();
  const value = env[name];
  if (
    !value ||
    !URL.canParse(value) ||
    !["postgres:", "postgresql:"].includes(new URL(value).protocol)
  )
    throw new DatabaseAuthorityError();
  return value;
}
