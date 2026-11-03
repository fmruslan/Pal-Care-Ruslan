import "server-only";
import { cookies, headers } from "next/headers";
import {
  OWNER_COOKIE,
  OWNER_ORIGIN,
  StandingOwner,
  type OwnerProof,
  ownerCookieName,
} from "./standing-owner";
import { CareError } from "./contracts";
import {
  northReviewLivePresentation,
  northReviewOrigin,
} from "../private-preview-origin";

export function standingOwnerMode(env = process.env) {
  return (
    env.CAREOS_OWNER_MODE === "true" &&
    (env.APP_ORIGIN === OWNER_ORIGIN || northReviewLivePresentation(env))
  );
}
export function configuredOwnerOrigin(env = process.env) {
  if (northReviewLivePresentation(env)) return northReviewOrigin;
  if (env.APP_ORIGIN === OWNER_ORIGIN) return OWNER_ORIGIN;
  throw new CareError("careos_owner_origin_rejected", 403);
}
export async function standingProof(): Promise<OwnerProof> {
  const h = await headers();
  const origin = configuredOwnerOrigin();
  if (
    h.get("host") !== new URL(origin).host ||
    (h.has("origin") && h.get("origin") !== origin) ||
    h.get("sec-fetch-site") === "cross-site"
  )
    throw new CareError("careos_owner_origin_rejected", 403);
  const jar = await cookies();
  return {
    token:
      jar.get(ownerCookieName(origin))?.value ?? jar.get(OWNER_COOKIE)?.value,
    agent: h.get("user-agent") ?? "",
    origin,
  };
}
export async function assertStandingOwner() {
  const proof = await standingProof();
  await new StandingOwner().authenticate(proof);
  return proof;
}
