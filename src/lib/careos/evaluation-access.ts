import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { CareError } from "./contracts";
import { privateHttpsPresentation } from "../private-preview-origin";
import { hostedDemo } from "../hosted-demo";

export type EvaluationScope = "customer" | "studio";
export const evaluationCookie = (scope: EvaluationScope) =>
  `palcare-ai-${scope}`;

// Hosted-only, stateless guest capabilities. The existing provider secret signs
// domain-separated cookies; neither it nor a raw capability is returned in JSON.
function guestSignature(
  payload: string,
  scope: EvaluationScope,
  env: Record<string, string | undefined>,
) {
  if (!hostedDemo(env) || (env.CAREOS_API_KEY?.length ?? 0) < 20)
    throw new CareError("careos_evaluation_access_required", 403);
  return createHmac("sha256", env.CAREOS_API_KEY!)
    .update(`palcare-hosted-guest-v1:${env.APP_ORIGIN}:${scope}:${payload}`)
    .digest("hex");
}

export function newGuestAccess(
  scope: EvaluationScope,
  env: Record<string, string | undefined>,
  now = Date.now(),
) {
  const { expires: deadline } = evaluationSettings(env, now);
  if (!hostedDemo(env))
    throw new CareError("careos_evaluation_access_required", 403);
  const expires = Math.min(now + 86400000, deadline);
  const payload = `g1.${expires}.${randomBytes(32).toString("hex")}`;
  return {
    token: `${payload}.${guestSignature(payload, scope, env)}`,
    expires,
  };
}

export type EvaluationAccessStatus = {
  window: "active" | "expired" | "unavailable";
  expiresAt: string | null;
  scopes: Record<EvaluationScope, boolean>;
};

// Read-only projection: never echoes capabilities, sets cookies, or renews a window.
export function evaluationAccessStatus(
  tokens: Partial<Record<EvaluationScope, string>>,
  env: Record<string, string | undefined>,
  now = Date.now(),
): EvaluationAccessStatus {
  const denied: EvaluationAccessStatus = {
    window: "unavailable",
    expiresAt: null,
    scopes: { customer: false, studio: false },
  };
  // Read-only legacy deadline display. This does not accept/migrate localhost
  // grants, enable pairing, call providers or change evaluationSettings below.
  if (
    privateHttpsPresentation(env) &&
    env.CAREOS_EVALUATION_ENABLED === "false"
  ) {
    const expires = Date.parse(env.CAREOS_EVALUATION_EXPIRES_AT ?? "");
    return Number.isFinite(expires)
      ? {
          ...denied,
          window: expires <= now ? "expired" : "unavailable",
          expiresAt: new Date(expires).toISOString(),
        }
      : denied;
  }
  try {
    const expires = Date.parse(env.CAREOS_EVALUATION_EXPIRES_AT ?? "");
    // Validate even an expired configuration before describing it as renewable.
    evaluationSettings(env, expires <= now ? expires - 1 : now);
    const status: EvaluationAccessStatus = {
      ...denied,
      window: expires <= now ? "expired" : "active",
      expiresAt: new Date(expires).toISOString(),
      scopes: { ...denied.scopes },
    };
    if (status.window === "active")
      for (const scope of ["customer", "studio"] as const) {
        try {
          assertEvaluationAccess(scope, tokens[scope], env, now);
          status.scopes[scope] = true;
        } catch {
          // A missing/wrong scope cookie grants no authority.
        }
      }
    return status;
  } catch {
    return denied;
  }
}
export function evaluationSettings(
  env: Record<string, string | undefined>,
  now = Date.now(),
) {
  const expires = Date.parse(env.CAREOS_EVALUATION_EXPIRES_AT ?? "");
  const hosted = hostedDemo(env);
  if (
    env.CAREOS_EVALUATION_ENABLED !== "true" ||
    !Number.isFinite(expires) ||
    expires <= now ||
    (hosted
      ? expires > Date.parse("2027-01-01T08:00:00Z")
      : expires > now + 86400000) ||
    (!hosted &&
      !["localhost", "127.0.0.1"].includes(
        URL.canParse(env.APP_ORIGIN ?? "")
          ? new URL(env.APP_ORIGIN!).hostname
          : "",
      ))
  )
    throw new CareError("careos_private_evaluation_required", 403);
  if (hosted) return { expires };
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
  if (hostedDemo(env)) {
    const match = /^g1\.(\d{13})\.([a-f0-9]{64})\.([a-f0-9]{64})$/.exec(
      token ?? "",
    );
    if (!match) throw new CareError("careos_evaluation_access_required", 403);
    const expires = Number(match[1]);
    if (
      expires <= now ||
      expires > settings.expires ||
      expires > now + 86400000 ||
      !timingSafeEqual(
        Buffer.from(match[3], "hex"),
        Buffer.from(
          guestSignature(`g1.${match[1]}.${match[2]}`, scope, env),
          "hex",
        ),
      )
    )
      throw new CareError("careos_evaluation_access_required", 403);
    return { expires };
  }
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
