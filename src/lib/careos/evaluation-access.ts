import { createHash, timingSafeEqual } from "node:crypto";
import { CareError } from "./contracts";

export type EvaluationScope = "customer" | "studio";
export const evaluationCookie = (scope: EvaluationScope) =>
  `palcare-ai-${scope}`;
export function evaluationSettings(
  env: Record<string, string | undefined>,
  now = Date.now(),
) {
  const expires = Date.parse(env.CAREOS_EVALUATION_EXPIRES_AT ?? "");
  if (
    env.CAREOS_EVALUATION_ENABLED !== "true" ||
    !Number.isFinite(expires) ||
    expires <= now ||
    expires > now + 86400000 ||
    !["localhost", "127.0.0.1"].includes(
      URL.canParse(env.APP_ORIGIN ?? "")
        ? new URL(env.APP_ORIGIN!).hostname
        : "",
    )
  )
    throw new CareError("careos_private_evaluation_required", 403);
  for (const name of [
    "CAREOS_CUSTOMER_ACCESS_HASH",
    "CAREOS_STUDIO_ACCESS_HASH",
  ])
    if (!/^[a-f0-9]{64}$/.test(env[name] ?? ""))
      throw new CareError("careos_private_evaluation_required", 403);
  if (env.CAREOS_CUSTOMER_ACCESS_HASH === env.CAREOS_STUDIO_ACCESS_HASH)
    throw new CareError("careos_scope_isolation_required", 403);
  return { expires };
}
export function assertEvaluationAccess(
  scope: EvaluationScope,
  token: string | undefined,
  env: Record<string, string | undefined>,
  now = Date.now(),
) {
  const settings = evaluationSettings(env, now);
  if (!/^[a-f0-9]{64}$/.test(token ?? ""))
    throw new CareError("careos_evaluation_access_required", 403);
  const digest = createHash("sha256").update(token!).digest();
  const expected = Buffer.from(
    env[
      scope === "customer"
        ? "CAREOS_CUSTOMER_ACCESS_HASH"
        : "CAREOS_STUDIO_ACCESS_HASH"
    ]!,
    "hex",
  );
  if (!timingSafeEqual(digest, expected))
    throw new CareError("careos_evaluation_access_required", 403);
  return settings;
}
