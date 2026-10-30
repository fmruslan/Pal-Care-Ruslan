import { z } from "zod";
import { StandingOwner, type OwnerProof } from "../standing-owner";
import { accessToken, type Transport } from "./auth";
import { PilotFiles } from "./files";
import { streamStructured } from "./pilot";
import { safeFailure } from "./pilot";

/** Provider lock serializes credential replacement and complete requests; owner
 * lock stays independently available for immediate logout/policy revocation. */
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
  return options.files.locked(async () => {
    const { owner, proof, scope } = options;
    // No refresh at all without present owner/policy/quota/provider authority.
    await owner.assertDispatch(proof, scope, options.enabled());
    await owner.assertHistoricalJournal(
      await options.files.read("session.json"),
    );
    const token = await accessToken(options.files, options.transport);
    const key = `${scope}:${options.requestId}:${options.name}`;
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
          await owner.reserve(proof, scope, key, options.enabled());
          reserved = true;
        },
      });
      await owner.settle(key, "completed", observation);
      reserved = false;
      return result;
    } catch (error) {
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
  });
}
