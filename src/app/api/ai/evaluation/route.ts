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
  evaluationAccessStatus,
  newGuestAccess,
} from "@/lib/careos/evaluation-access";
import { hostedDemo } from "@/lib/hosted-demo";
import { parseCareConfig } from "@/lib/careos/config";

export async function GET() {
  const jar = await cookies();
  if (hostedDemo(process.env)) {
    try {
      const { careRuntime } = await import("@/lib/careos/runtime");
      const { PostgresStore } = await import("@/lib/careos/postgres-store");
      const { store } = careRuntime();
      return careResponse({
        ...evaluationAccessStatus(
          {
            customer: jar.get(evaluationCookie("customer"))?.value,
            studio: jar.get(evaluationCookie("studio"))?.value,
          },
          process.env,
        ),
        budget:
          store instanceof PostgresStore ? await store.spendingStatus() : null,
      });
    } catch (error) {
      return careError(error);
    }
  }
  return careResponse(
    evaluationAccessStatus(
      {
        customer: jar.get(evaluationCookie("customer"))?.value,
        studio: jar.get(evaluationCookie("studio"))?.value,
      },
      process.env,
    ),
  );
}

// Private, explicitly configured local evaluation access; not customer registration.
export async function POST(request: Request) {
  try {
    assertOrigin(request, process.env.APP_ORIGIN ?? "");
    if (hostedDemo(process.env)) {
      z.strictObject({}).parse(await readJson(request));
      // Validate configured persistent accounting before granting guest scopes.
      parseCareConfig(process.env);
      const jar = await cookies();
      for (const scope of ["customer", "studio"] as const) {
        const existing = jar.get(evaluationCookie(scope))?.value;
        try {
          assertEvaluationAccess(scope, existing, process.env);
        } catch {
          const { token, expires } = newGuestAccess(scope, process.env);
          jar.set(evaluationCookie(scope), token, {
            httpOnly: true,
            sameSite: "strict",
            secure: true,
            path: "/",
            expires: new Date(expires),
          });
        }
      }
      return careResponse({ guest: true });
    }
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
