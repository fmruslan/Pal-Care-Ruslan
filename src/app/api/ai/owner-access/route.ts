import { cookies } from "next/headers";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { PilotFiles } from "@/lib/careos/subscription/files";
import {
  PAIR_COOKIE,
  completeOwnerAccess,
  ownerAccessStatus,
  pairingScopes,
  requestOwnerAccess,
} from "@/lib/careos/owner-access";
import { evaluationCookie } from "@/lib/careos/evaluation-access";
import {
  assertOrigin,
  careError,
  careResponse,
  readJson,
} from "@/lib/careos/security";
import { CareError } from "@/lib/careos/contracts";

const files = () =>
  new PilotFiles(join(homedir(), ".config/palcare-chatgpt-pilot"));
const schema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("request"), scopes: pairingScopes }),
  z.strictObject({ action: z.literal("complete"), requestId: z.uuid() }),
]);
export async function GET() {
  try {
    return careResponse({
      pairing: await ownerAccessStatus(
        files(),
        process.env,
        (await cookies()).get(PAIR_COOKIE)?.value,
      ),
    });
  } catch (e) {
    return careError(e);
  }
}
export async function POST(request: Request) {
  try {
    assertOrigin(request, process.env.APP_ORIGIN ?? "");
    const parsed = schema.safeParse(await readJson(request));
    if (!parsed.success)
      throw new CareError("owner_pairing_invalid_request", 400);
    const input = parsed.data,
      jar = await cookies();
    const options = {
      httpOnly: true,
      sameSite: "strict" as const,
      secure: process.env.APP_ORIGIN!.startsWith("https:"),
    };
    if (input.action === "request") {
      const result = await requestOwnerAccess(
        files(),
        process.env,
        input.scopes,
      );
      jar.set(PAIR_COOKIE, result.browser, {
        ...options,
        path: "/api/ai/owner-access",
        expires: new Date(result.pairing.expiresAt),
      });
      return careResponse({ pairing: result.pairing }, 201);
    }
    const grant = await completeOwnerAccess(
      files(),
      process.env,
      jar.get(PAIR_COOKIE)?.value,
      input.requestId,
    );
    if (!grant) return careResponse({ pending: true }, 202);
    for (const scope of grant.scopes)
      jar.set(evaluationCookie(scope), grant.app[scope], {
        ...options,
        path: "/",
        expires: new Date(grant.app.expiresAt),
      });
    jar.set(PAIR_COOKIE, "", {
      ...options,
      path: "/api/ai/owner-access",
      maxAge: 0,
    });
    return careResponse({
      authorized: grant.scopes,
      expiresAt: new Date(grant.app.expiresAt).toISOString(),
    });
  } catch (e) {
    return careError(e);
  }
}
