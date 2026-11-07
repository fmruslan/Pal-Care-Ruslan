import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  assertOwnerRequest,
  OWNER_ORIGIN,
  StandingOwner,
  ownerCookieName,
} from "@/lib/careos/standing-owner";
import {
  standingOwnerMode,
  configuredOwnerOrigin,
  standingProof,
} from "@/lib/careos/standing-runtime";
import { subscriptionFiles } from "@/lib/careos/subscription/provider";
import { CareError } from "@/lib/careos/contracts";
import { careError, careResponse, readJson } from "@/lib/careos/security";
import { recordsRuntime } from "@/lib/careos/records/runtime";
import {
  RECOVERY_COOKIE,
  checkRecoveryHistory,
  type RecoveryHistoryEvidence,
} from "@/lib/careos/evaluation-recovery";
import type { OwnerProof } from "@/lib/careos/standing-owner";

export const runtime = "nodejs";
async function context(request: Request, mutation: boolean) {
  if (!standingOwnerMode())
    throw new CareError("careos_owner_ai_disabled", 403);
  const origin = configuredOwnerOrigin();
  assertOwnerRequest(request, mutation, origin);
  const owner = new StandingOwner();
  await owner.assertOriginApproval(origin);
  return {
    owner,
    origin,
    cookieName: ownerCookieName(origin),
    jar: await cookies(),
    agent: request.headers.get("user-agent") ?? "",
  };
}
export async function GET(request: Request) {
  const diagnosticId = randomUUID();
  try {
    const { owner } = await context(request, false);
    const status = await owner.status(await standingProof(), (reason) => {
      // Protected service journal only. Never log headers, tokens, hashes or UA.
      if (reason !== "accepted")
        console.info(
          JSON.stringify({ ownerAccess: "status", diagnosticId, reason }),
        );
    });
    let provider = "Verify this browser to view the connection";
    if (status.remembered) {
      const registration = await subscriptionFiles().registration();
      provider = !registration?.tokens
        ? "Sign in required"
        : registration.refreshPending
          ? "Connection needs review"
          : registration.tokens.expiresAt <= Date.now()
            ? "Refresh needed before authorized use"
            : "Connected; capacity not checked";
      if (status.providerBlocked)
        provider = "Provider access paused; owner review needed";
    }
    return careResponse({
      ...status,
      liveEnabled: process.env.CAREOS_STANDING_AI_ENABLED === "true",
      provider,
      diagnosticId,
    });
  } catch (error) {
    console.info(
      JSON.stringify({
        ownerAccess: "status-error",
        diagnosticId,
        code: error instanceof CareError ? error.code : "server-error",
      }),
    );
    return careError(error);
  }
}
const actionSchema = z.strictObject({
  action: z.enum([
    "pair",
    "finish",
    "logout",
    "revoke",
    "evaluation-recovery-request",
    "evaluation-recovery-finish",
  ]),
});
const cookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "strict" as const,
  path: "/",
};
/** DB reads are OUTSIDE the owner lock: store claims use DB -> owner ordering. */
async function recoveryHistory(
  owner: StandingOwner,
  proof: OwnerProof,
): Promise<RecoveryHistoryEvidence> {
  const { binding } = await owner.evaluationRecoveryBinding();
  if (
    proof.origin !== OWNER_ORIGIN ||
    proof.recordsOwnerDigest !== binding.recordsOwnerDigest
  )
    throw new CareError("careos_owner_evaluation_recovery_denied", 403);
  const { store } = recordsRuntime();
  return checkRecoveryHistory(binding, proof, (id, digest) =>
    store.get(id, digest),
  );
}
export async function POST(request: Request) {
  try {
    const { owner, jar, agent, cookieName } = await context(request, true);
    const parsed = actionSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new CareError("careos_invalid_request", 400);
    const proof = await standingProof();
    if (parsed.data.action === "logout") {
      try {
        await owner.logout(proof, jar.get(RECOVERY_COOKIE)?.value);
      } catch (error) {
        // Only an actually unbound stale cookie can be discarded without a
        // persisted cancellation. Failed journal/cap writes remain errors.
        if (
          !(error instanceof CareError) ||
          error.code !== "careos_owner_signin_required"
        )
          throw error;
      } finally {
        jar.set(RECOVERY_COOKIE, "", { ...cookieOptions, maxAge: 0 });
        jar.set(cookieName, "", { ...cookieOptions, maxAge: 0 });
      }
      return careResponse({ ok: true });
    }
    if (
      parsed.data.action === "evaluation-recovery-request" ||
      parsed.data.action === "evaluation-recovery-finish"
    ) {
      if (process.env.CAREOS_STANDING_AI_ENABLED !== "true")
        throw new CareError("careos_owner_ai_disabled", 403);
      // The revoked AI cookie is not used even to identify recovery. Only the
      // separate valid records cookie, fixed owned history and host approval.
      const recoveryProof = { ...proof, token: undefined };
      const evidence = await recoveryHistory(owner, recoveryProof);
      if (parsed.data.action === "evaluation-recovery-request") {
        const pending = await owner.requestEvaluationRecovery(
          recoveryProof,
          evidence,
        );
        jar.set(RECOVERY_COOKIE, pending.token, {
          ...cookieOptions,
          maxAge: Math.max(
            0,
            Math.floor((pending.expiresAt - Date.now()) / 1000),
          ),
        });
        return careResponse({ id: pending.id });
      }
      const finished = await owner.finishEvaluationRecovery(
        recoveryProof,
        jar.get(RECOVERY_COOKIE)?.value,
        evidence,
      );
      jar.set(RECOVERY_COOKIE, "", { ...cookieOptions, maxAge: 0 });
      jar.set(cookieName, finished.token, {
        ...cookieOptions,
        maxAge: Math.max(
          0,
          Math.floor((finished.expiresAt - Date.now()) / 1000),
        ),
      });
      return careResponse({ ok: true, expiresAt: finished.expiresAt });
    }
    if (parsed.data.action === "pair") {
      const pair = await owner.pair(agent, proof.token);
      if (!pair.reused)
        jar.set(cookieName, pair.token, { ...cookieOptions, maxAge: 300 });
      return careResponse({ id: pair.id }); // Public request ID, never the secret.
    }
    if (parsed.data.action === "finish") {
      const expiresAt = await owner.finishBrowser(proof);
      jar.set(cookieName, proof.token!, {
        ...cookieOptions,
        maxAge: Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)),
      });
    } else await owner.revokePolicy(proof);
    return careResponse({ ok: true });
  } catch (error) {
    console.info(
      JSON.stringify({
        ownerAccess: "change-error",
        code: error instanceof CareError ? error.code : "server-error",
      }),
    );
    return careError(error);
  }
}
