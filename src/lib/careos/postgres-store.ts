import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { assertDatabaseAuthority } from "../../db/authority";
import {
  CareError,
  type CareTurn,
  type Conversation,
  type TurnInput,
} from "./contracts";
import type { ConversationStore } from "./store";

export type SpendingConfig = {
  dailyMicro: number;
  totalMicro: number;
  budgetId: string;
};
export const CALL_RESERVATION_MICRO = 40000; // $0.04, above bounded supported-model maximum.
function fingerprint(input: TurnInput) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export class PostgresStore implements ConversationStore {
  constructor(
    private pool: Pool,
    private spending: SpendingConfig = {
      dailyMicro: 0,
      totalMicro: 0,
      budgetId: "disabled",
    },
    private requireRestrictedRole = false,
    private now: () => number = Date.now,
  ) {}
  private async tx<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      if (this.requireRestrictedRole) {
        try {
          await assertDatabaseAuthority(client, "careos");
        } catch {
          throw new CareError("careos_writer_not_restricted");
        }
      }
      const value = await work(client);
      await client.query("commit");
      return value;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
  private async owned(client: PoolClient, id: string, owner: string) {
    const result = await client.query(
      "select * from care_conversations where id=$1 and owner=$2 and expires_at > now() for update",
      [id, owner],
    );
    if (!result.rowCount)
      throw new CareError("careos_conversation_not_found", 404);
    return result.rows[0] as {
      pending_id: string | null;
      pending_until: Date | null;
      expires_at: Date;
    };
  }
  private async quotas(
    client: PoolClient,
    budgets: [string, number, number][],
  ) {
    // Stable lock order, all-or-nothing reservation across workers and instances.
    for (const [key, amount, limit] of budgets.sort((a, b) =>
      a[0].localeCompare(b[0]),
    )) {
      if (amount > limit) throw new CareError("careos_limit", 429);
      const result = await client.query(
        "insert into care_buckets(key, amount) values ($1,$2) on conflict(key) do update set amount=care_buckets.amount + excluded.amount where care_buckets.amount + excluded.amount <= $3 returning key",
        [key, amount, limit],
      );
      if (!result.rowCount) throw new CareError("careos_limit", 429);
    }
  }
  async create(owner: string): Promise<Conversation> {
    const id = randomUUID();
    const expiresAt = new Date(Date.now() + 86400000).toISOString();
    await this.tx(async (client) => {
      const hour = Math.floor(Date.now() / 3600000),
        day = Math.floor(Date.now() / 86400000);
      await this.quotas(client, [
        [`create:owner:${owner}:${hour}`, 1, 10],
        [`create:global:${day}`, 1, 500],
      ]);
      await client.query(
        "insert into care_conversations(id,owner,expires_at) values($1,$2,$3)",
        [id, owner, expiresAt],
      );
    });
    return { id, expiresAt, turns: [] };
  }
  async get(id: string, owner: string): Promise<Conversation> {
    return this.tx(async (client) => {
      const row = await this.owned(client, id, owner);
      const turns = await client.query(
        "select result from care_requests where conversation_id=$1 and result is not null order by created_at, id limit 40",
        [id],
      );
      return {
        id,
        expiresAt: row.expires_at.toISOString(),
        turns: turns.rows.map((r) => r.result as CareTurn),
      };
    });
  }
  async clear(id: string, owner: string) {
    await this.tx(async (client) => {
      const row = await this.owned(client, id, owner);
      if (
        row.pending_id &&
        row.pending_until &&
        row.pending_until.getTime() > Date.now()
      )
        throw new CareError("careos_turn_in_progress", 409);
      await client.query(
        "delete from care_conversations where id=$1 and owner=$2",
        [id, owner],
      );
    });
  }
  async claim(
    id: string,
    owner: string,
    input: TurnInput,
  ): Promise<CareTurn | null> {
    return this.tx(async (client) => {
      const row = await this.owned(client, id, owner);
      const prior = await client.query(
        "select conversation_id, fingerprint, result from care_requests where id=$1",
        [input.requestId],
      );
      if (prior.rowCount) {
        if (
          prior.rows[0].conversation_id !== id ||
          prior.rows[0].fingerprint !== fingerprint(input)
        )
          throw new CareError("careos_request_conflict", 409);
        if (!prior.rows[0].result)
          throw new CareError("careos_request_unknown", 409);
        return prior.rows[0].result as CareTurn;
      }
      if (
        row.pending_id &&
        row.pending_until &&
        row.pending_until.getTime() > Date.now()
      )
        throw new CareError("careos_turn_in_progress", 409);
      const count = await client.query(
        "select count(*)::int as n from care_requests where conversation_id=$1",
        [id],
      );
      if (count.rows[0].n >= 40)
        throw new CareError("careos_conversation_full", 429);
      const minute = Math.floor(Date.now() / 60000),
        hour = Math.floor(Date.now() / 3600000);
      await this.quotas(client, [
        [`turn:owner:${owner}:${minute}`, 1, 6],
        [`turn:owner:${owner}:${hour}`, 1, 30],
        [`turn:global:${hour}`, 1, 5000],
      ]);
      await client.query(
        "insert into care_requests(id,conversation_id,fingerprint) values($1,$2,$3)",
        [input.requestId, id, fingerprint(input)],
      );
      await client.query(
        "update care_conversations set pending_id=$2, pending_until=now()+interval '30 seconds' where id=$1",
        [id, input.requestId],
      );
      return null;
    });
  }
  async finish(id: string, owner: string, turn: CareTurn) {
    await this.tx(async (client) => {
      const row = await this.owned(client, id, owner);
      if (row.pending_id !== turn.requestId)
        throw new CareError("careos_request_conflict", 409);
      await client.query(
        "update care_requests set result=$3 where id=$1 and conversation_id=$2 and result is null",
        [turn.requestId, id, JSON.stringify(turn)],
      );
      await client.query(
        "update care_conversations set pending_id=null,pending_until=null where id=$1",
        [id],
      );
    });
  }
  private spendKeys() {
    return [
      `spend:daily:${Math.floor(this.now() / 86400000)}`,
      `spend:total:${this.spending.budgetId}`,
    ];
  }
  async reserve(id: string, owner: string, requestId: string) {
    return this.tx(async (client) => {
      if (
        (
          await client.query("select 1 from care_buckets where key=$1", [
            `spend:blocked:${this.spending.budgetId}`,
          ])
        ).rowCount
      )
        throw new CareError("careos_budget_blocked", 503);
      const row = await this.owned(client, id, owner);
      if (
        row.pending_id !== requestId ||
        !row.pending_until ||
        row.pending_until.getTime() <= Date.now()
      )
        throw new CareError("careos_request_conflict", 409);
      const request = await client.query(
        "select provider_calls from care_requests where id=$1 and conversation_id=$2 and result is null for update",
        [requestId, id],
      );
      if (!request.rowCount || request.rows[0].provider_calls >= 2)
        throw new CareError("careos_call_limit", 429);
      const [daily, total] = this.spendKeys();
      const hour = Math.floor(Date.now() / 3600000),
        day = Math.floor(Date.now() / 86400000);
      await this.quotas(client, [
        [daily, CALL_RESERVATION_MICRO, this.spending.dailyMicro],
        [total, CALL_RESERVATION_MICRO, this.spending.totalMicro],
        [`model:hour:${hour}`, 1, 200],
        [`model:day:${day}`, 1, 500],
      ]);
      const call = (request.rows[0].provider_calls as number) + 1;
      await client.query(
        "insert into care_model_calls(request_id,call,reserved_micro,bucket_keys) values($1,$2,$3,$4)",
        [
          requestId,
          call,
          CALL_RESERVATION_MICRO,
          JSON.stringify([daily, total]),
        ],
      );
      await client.query(
        "update care_requests set reserved_micro=reserved_micro+$2,provider_calls=provider_calls+1 where id=$1",
        [requestId, CALL_RESERVATION_MICRO],
      );
      return {
        call,
        keys: [daily, total],
      };
    });
  }
  async settle(
    id: string,
    owner: string,
    requestId: string,
    reservation: { call: number; keys: string[] },
    actualMicro: number,
  ) {
    if (!Number.isSafeInteger(actualMicro) || actualMicro < 0)
      throw new CareError("careos_usage_invalid");
    const overrun = await this.tx(async (client) => {
      await this.owned(client, id, owner);
      const request = await client.query(
        "select id from care_requests where id=$1 and conversation_id=$2 for update",
        [requestId, id],
      );
      const saved = (
        await client.query(
          "select * from care_model_calls where request_id=$1 and call=$2 for update",
          [requestId, reservation.call],
        )
      ).rows[0];
      if (
        !request.rowCount ||
        !saved ||
        JSON.stringify(saved.bucket_keys) !== JSON.stringify(reservation.keys)
      )
        throw new CareError("careos_usage_conflict", 409);
      if (saved.actual_micro !== null) {
        if (saved.actual_micro !== actualMicro)
          throw new CareError("careos_usage_conflict", 409);
        return false; // Identical replay: no second release.
      }
      if (actualMicro > saved.reserved_micro) {
        await client.query(
          "insert into care_buckets(key,amount) values($1,1) on conflict(key) do nothing",
          [`spend:blocked:${this.spending.budgetId}`],
        );
        return true; // Commit the block; never release an under-reservation.
      }
      const released = CALL_RESERVATION_MICRO - actualMicro;
      for (const key of [...saved.bucket_keys].sort()) {
        const result = await client.query(
          "update care_buckets set amount=amount-$2 where key=$1 and amount >= $2",
          [key, released],
        );
        if (result.rowCount !== 1)
          throw new CareError("careos_usage_conflict", 409);
      }
      await client.query(
        "update care_model_calls set actual_micro=$3,settled_at=now() where request_id=$1 and call=$2",
        [requestId, reservation.call, actualMicro],
      );
      await client.query(
        "update care_requests set actual_micro=coalesce(actual_micro,0)+$2,reserved_micro=reserved_micro-$3,settled_calls=settled_calls+1 where id=$1",
        [requestId, actualMicro, released],
      );
      return false;
    });
    if (overrun) throw new CareError("careos_usage_exceeded_reservation");
  }
}
