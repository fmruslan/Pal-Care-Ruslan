import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { GuardianError } from "../price-guardian/contracts";
import { transaction, counter } from "../price-guardian/database";

export const operatorActions = [
  "policy:publish",
  "price:publish",
  "case:approve",
  "refund:execute",
  "refund:reconcile",
] as const;
export type OperatorAction = (typeof operatorActions)[number];
const grantSchema = z.strictObject({
  actions: z.array(z.enum(operatorActions)).min(1).max(5),
  caseId: z.uuid().nullable(),
  hours: z.int().min(1).max(8),
});
export const OPERATOR_COOKIE = "palcare_operator";
export const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/);
export const digestToken = (token: string) =>
  createHash("sha256").update(token).digest("hex");

export async function authorize(
  client: PoolClient,
  session: string,
  action: OperatorAction,
  caseId: string | null = null,
) {
  const result = await client.query(
    "select g.id,g.actions,g.case_id from operator_sessions s join operator_grants g on g.id=s.grant_id where s.hash=$1 and s.expires_at>now() and g.expires_at>now() and g.revoked_at is null for share of g,s",
    [session],
  );
  const row = result.rows[0] as
    { id: string; actions: string[]; case_id: string | null } | undefined;
  if (
    !row ||
    !row.actions.includes(action) ||
    (caseId !== null && row.case_id !== caseId) ||
    (caseId === null && row.case_id !== null)
  )
    throw new GuardianError("operator_not_authorized", 403);
  return row.id;
}
export class OperatorService {
  constructor(private pool: Pool) {}
  async issue(input: unknown) {
    const parsed = grantSchema.safeParse(input);
    if (!parsed.success) throw new GuardianError("operator_invalid_grant", 400);
    const scope = parsed.data;
    if (
      scope.actions.some(
        (a) => a.startsWith("case:") || a.startsWith("refund:"),
      ) &&
      !scope.caseId
    )
      throw new GuardianError("operator_exact_case_required", 400);
    const code = randomBytes(32).toString("hex"),
      id = randomUUID();
    await transaction(this.pool, async (client) => {
      if (
        scope.caseId &&
        !(
          await client.query("select id from guardian_cases where id=$1", [
            scope.caseId,
          ])
        ).rowCount
      )
        throw new GuardianError("guardian_not_found", 404);
      await client.query(
        "insert into operator_grants(id,code_hash,actions,case_id,expires_at) values($1,$2,$3,$4,now()+($5 * interval '1 hour'))",
        [
          id,
          digestToken(code),
          JSON.stringify(scope.actions),
          scope.caseId,
          scope.hours,
        ],
      );
    });
    return { id, code };
  }
  async activate(code: string) {
    if (!tokenSchema.safeParse(code).success)
      throw new GuardianError("operator_activation_invalid", 403);
    const token = randomBytes(32).toString("hex");
    await transaction(this.pool, (client) =>
      counter(
        client,
        `operator:activate:${Math.floor(Date.now() / 3600000)}`,
        1,
        100,
      ),
    );
    await transaction(this.pool, async (client) => {
      const result = await client.query(
        "update operator_grants set used_at=now() where code_hash=$1 and used_at is null and revoked_at is null and expires_at>now() returning id",
        [digestToken(code)],
      );
      if (!result.rowCount)
        throw new GuardianError("operator_activation_invalid", 403);
      await client.query(
        "insert into operator_sessions(hash,grant_id,expires_at) values($1,$2,now()+interval '1 hour')",
        [digestToken(token), result.rows[0].id],
      );
    });
    return token;
  }
  async revoke(id: string) {
    await this.pool.query(
      "update operator_grants set revoked_at=now() where id=$1 and revoked_at is null",
      [id],
    );
  }
  async view(session: string) {
    const result = await this.pool.query(
      "select g.id,g.actions,g.case_id,s.expires_at from operator_sessions s join operator_grants g on g.id=s.grant_id where s.hash=$1 and s.expires_at>now() and g.expires_at>now() and g.revoked_at is null",
      [session],
    );
    return result.rows[0] ?? null;
  }
}
