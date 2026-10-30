import "server-only";
import { cookies, headers } from "next/headers";
import {
  OWNER_COOKIE,
  OWNER_ORIGIN,
  StandingOwner,
  type OwnerProof,
} from "./standing-owner";
import { CareError } from "./contracts";

export function standingOwnerMode(env = process.env) {
  return env.CAREOS_OWNER_MODE === "true" && env.APP_ORIGIN === OWNER_ORIGIN;
}
export async function standingProof(): Promise<OwnerProof> {
  const h = await headers();
  if (
    h.get("host") !== new URL(OWNER_ORIGIN).host ||
    (h.has("origin") && h.get("origin") !== OWNER_ORIGIN) ||
    h.get("sec-fetch-site") === "cross-site"
  )
    throw new CareError("careos_owner_origin_rejected", 403);
  return {
    token: (await cookies()).get(OWNER_COOKIE)?.value,
    agent: h.get("user-agent") ?? "",
  };
}
export async function assertStandingOwner() {
  const proof = await standingProof();
  await new StandingOwner().authenticate(proof);
  return proof;
}
