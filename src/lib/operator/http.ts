import "server-only";
import { cookies } from "next/headers";
import { boundedJson, requireSameOrigin } from "../commerce/security";
import { CheckoutError } from "../commerce/contracts";
import { GuardianError } from "../price-guardian/contracts";
import { OPERATOR_COOKIE, tokenSchema, digestToken } from "./service";

export async function operatorSession() {
  const value = (await cookies()).get(OPERATOR_COOKIE)?.value;
  if (!tokenSchema.safeParse(value).success)
    throw new GuardianError("operator_not_authorized", 403);
  return digestToken(value!);
}
export async function operatorJson(request: Request, origin: string) {
  requireSameOrigin(request, origin);
  return boundedJson(request);
}
export function guardianResponse(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
  });
}
export function guardianError(error: unknown) {
  const known =
    error instanceof GuardianError || error instanceof CheckoutError;
  return Response.json(
    { error: known ? error.code : "guardian_unavailable" },
    {
      status: known ? error.status : 503,
      headers: {
        "Cache-Control": "private, no-store",
        ...(known && error.status === 429 ? { "Retry-After": "60" } : {}),
      },
    },
  );
}
