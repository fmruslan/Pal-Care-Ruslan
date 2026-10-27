import { cookies } from "next/headers";
import { z } from "zod";
import {
  assertOrigin,
  readJson,
  careError,
  careResponse,
} from "@/lib/careos/security";
import {
  assertEvaluationAccess,
  evaluationCookie,
} from "@/lib/careos/evaluation-access";

// Private, explicitly configured local evaluation access; not customer registration.
export async function POST(request: Request) {
  try {
    assertOrigin(request, process.env.APP_ORIGIN ?? "");
    const { scope, token } = z
      .strictObject({
        scope: z.enum(["customer", "studio"]),
        token: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .parse(await readJson(request));
    const { expires } = assertEvaluationAccess(scope, token, process.env);
    (await cookies()).set(evaluationCookie(scope), token, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.APP_ORIGIN!.startsWith("https:"),
      path: "/",
      expires: new Date(expires),
    });
    return careResponse({
      authorized: scope,
      expiresAt: new Date(expires).toISOString(),
    });
  } catch (e) {
    return careError(e);
  }
}
