import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  assertOwnerRequest,
  OWNER_COOKIE,
  StandingOwner,
} from "@/lib/careos/standing-owner";
import { standingOwnerMode } from "@/lib/careos/standing-runtime";
import { subscriptionFiles } from "@/lib/careos/subscription/provider";
import { CareError } from "@/lib/careos/contracts";
import { careError, careResponse, readJson } from "@/lib/careos/security";

export const runtime = "nodejs";
async function context(request: Request, mutation: boolean) {
  if (!standingOwnerMode())
    throw new CareError("careos_owner_ai_disabled", 403);
  assertOwnerRequest(request, mutation);
  return {
    owner: new StandingOwner(),
    jar: await cookies(),
    agent: request.headers.get("user-agent") ?? "",
  };
}
export async function GET(request: Request) {
  const diagnosticId = randomUUID();
  try {
    const { owner, jar, agent } = await context(request, false);
    const status = await owner.status(
      {
        token: jar.get(OWNER_COOKIE)?.value,
        agent,
      },
      (reason) => {
        // Protected service journal only. Never log headers, tokens, hashes or UA.
        if (reason !== "accepted")
          console.info(
            JSON.stringify({ ownerAccess: "status", diagnosticId, reason }),
          );
      },
    );
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
  action: z.enum(["pair", "finish", "logout", "revoke"]),
});
const cookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "strict" as const,
  path: "/",
};
export async function POST(request: Request) {
  try {
    const { owner, jar, agent } = await context(request, true);
    const parsed = actionSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new CareError("careos_invalid_request", 400);
    const proof = { token: jar.get(OWNER_COOKIE)?.value, agent };
    if (parsed.data.action === "pair") {
      const pair = await owner.pair(agent, proof.token);
      if (!pair.reused)
        jar.set(OWNER_COOKIE, pair.token, { ...cookieOptions, maxAge: 300 });
      return careResponse({ id: pair.id }); // Public request ID, never the secret.
    }
    if (parsed.data.action === "finish") {
      const expiresAt = await owner.finishBrowser(proof);
      jar.set(OWNER_COOKIE, proof.token!, {
        ...cookieOptions,
        maxAge: Math.max(0, Math.floor((expiresAt - Date.now()) / 1000)),
      });
    } else if (parsed.data.action === "logout") {
      // A stale/expired local cookie can always be cleared; valid sessions are revoked.
      try {
        await owner.logout(proof);
      } catch (error) {
        if (
          !(error instanceof CareError) ||
          error.code !== "careos_owner_signin_required"
        )
          throw error;
      }
      jar.set(OWNER_COOKIE, "", { ...cookieOptions, maxAge: 0 });
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
