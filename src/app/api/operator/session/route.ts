import { cookies } from "next/headers";
import { z } from "zod";
import { guardianRuntime } from "@/lib/price-guardian/runtime";
import { GuardianError } from "@/lib/price-guardian/contracts";
import {
  guardianResponse,
  guardianError,
  operatorSession,
  operatorJson,
} from "@/lib/operator/http";
import { OPERATOR_COOKIE, tokenSchema } from "@/lib/operator/service";

export async function GET() {
  try {
    const runtime = await guardianRuntime();
    return guardianResponse({
      session: await runtime.operator.view(await operatorSession()),
      refundsEnabled: process.env.GUARDIAN_REFUNDS_ENABLED === "true",
      readsEnabled: process.env.GUARDIAN_PROVIDER_READS_ENABLED === "true",
    });
  } catch (error) {
    return guardianError(error);
  }
}
export async function POST(request: Request) {
  try {
    const runtime = await guardianRuntime();
    const parsed = z
      .strictObject({ code: tokenSchema })
      .safeParse(await operatorJson(request, runtime.origin));
    if (!parsed.success)
      throw new GuardianError("operator_activation_invalid", 400);
    const token = await runtime.operator.activate(parsed.data.code);
    (await cookies()).set(OPERATOR_COOKIE, token, {
      httpOnly: true,
      secure: runtime.origin.startsWith("https:"),
      sameSite: "lax",
      path: "/",
      maxAge: 3600,
    });
    return guardianResponse({ activated: true });
  } catch (error) {
    return guardianError(error);
  }
}
