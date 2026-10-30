import { z } from "zod";
import { StandingOwner, type OwnerProof } from "../standing-owner";
import { accessToken, type Transport } from "./auth";
import { PilotFiles } from "./files";
import { streamStructured } from "./pilot";
import { safeFailure } from "./pilot";
import { setTimeout as delay } from "node:timers/promises";

/** Refresh is serialized, inference is not. Each attempt reserves atomically in
 * the independent owner ledger. No retries of streams or uncertain dispatch. */
export async function standingStructured<T extends z.ZodType>(options: {
  files: PilotFiles;
  owner: StandingOwner;
  proof: OwnerProof;
  scope: "customer" | "customer-studio";
  enabled: () => boolean;
  requestId: string;
  payload: string;
  schema: T;
  name: string;
  signal: AbortSignal;
  prompt?: string;
  transport?: Transport;
}) {
  for (let attempt = 0; ; attempt++) {
    const { owner, proof, scope } = options;
    // No refresh at all without present owner/policy/quota/provider authority.
    const policy = await owner.assertDispatch(proof, scope, options.enabled());
    await owner.assertHistoricalJournal(
      await options.files.read("session.json"),
    );
    const token = await options.files.lockedWaiting(
      async () => {
        await owner.assertDispatch(proof, scope, options.enabled());
        return accessToken(options.files, options.transport);
      },
      ".lock",
      options.signal,
      15000,
    );
    const base = `${scope}:${options.requestId}:${options.name}`;
    const key = attempt === 0 ? base : `${base}:retry-${attempt}`;
    let reserved = false;
    const observation: Record<string, unknown> = {};
    try {
      const result = await streamStructured({
        ...options,
        accessToken: token,
        observe: (summary) => {
          for (const field of ["httpStatus", "requestId", "usage"])
            if (summary[field] !== undefined && summary[field] !== null)
              observation[field] = summary[field];
        },
        beforeDispatch: async () => {
          // Re-check after refresh/network delay and durably reserve before POST.
          options.signal.throwIfAborted();
          await owner.reserve(proof, scope, key, options.enabled());
          reserved = true;
        },
      });
      await owner.settle(key, "completed", observation);
      reserved = false;
      return result;
    } catch (error) {
      // Only a completed HTTP rejection with one of these exact temporary
      // admission codes proves no stream opened. A timeout/reset, partial SSE,
      // 429/permission denial or arbitrary 5xx is never automatically retried.
      const safeRejection =
        observation.httpStatus === 503 &&
        [
          "subscription_sharing_usage_unavailable",
          "subscription_sharing_user_unavailable",
        ].includes(safeFailure(error));
      if (safeRejection && reserved) {
        await owner.settle(key, "failed", observation);
        reserved = false;
        if (attempt < policy.maxRetries && !options.signal.aborted) {
          await delay(1000, undefined, { signal: options.signal });
          continue;
        }
      }
      if (
        [401, 403, 429].includes(Number(observation.httpStatus)) ||
        /subscription_sharing_(user_not_eligible|usage_limit_exceeded|invalid_user|route_not_supported)|chatpass_v2_|pilot_http_40[13]/.test(
          safeFailure(error),
        )
      )
        await owner.blockProvider();
      throw error;
    } finally {
      // Unknown output/timeout still consumes quota; never retry automatically.
      if (reserved) await owner.settle(key, "unknown", observation);
    }
  }
}
