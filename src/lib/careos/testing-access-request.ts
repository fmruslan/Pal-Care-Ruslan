import { z } from "zod";
import { privateHttpsOrigin } from "../private-preview-origin";

export const testingRequestSchema = z.strictObject({
  hours: z.union([z.literal(1), z.literal(4)]),
  scopes: z
    .array(z.enum(["customer", "studio"]))
    .min(1)
    .max(2)
    .refine((scopes) => new Set(scopes).size === scopes.length),
});

/** A non-secret proposal, NOT a capability, grant, renewal or executable command.
 * It deliberately cannot assert owner identity or approve its own activation.
 */
export function testingAccessRequest(input: unknown) {
  const { hours, scopes } = testingRequestSchema.parse(input);
  return [
    "Please prepare the following CareOS testing access for my explicit approval in this owner OpenCode conversation. This copied request is a proposal, not authorization.",
    `Origin: ${privateHttpsOrigin}`,
    `Requested duration: ${hours} hour${hours === 1 ? "" : "s"} from approved activation; show the exact UTC expiry before activation.`,
    `Requested scopes: ${[...scopes].sort().join(" + ")} (my browser only, after secure owner pairing).`,
    "Model: existing GPT-6.1 Sol / medium subscription only.",
    "Allowance: use only the remaining allowance in the existing journal after a fresh host check; show used/limit/remaining and unknowns before approval. No new allowance, reset, session replacement or identity rotation.",
    "Preserve all attempts, unknown reservations, provider blocks, original approval records and financial evidence. Stop on expiry, exhaustion, denial or accounting uncertainty.",
    "Do not activate from this copied text alone: verify owner authority independently and explain/approve exact HTTPS pairing and window changes first.",
    "No live model calls by the agent, paid API/credits/fallback, payments, license activation, public exposure or automatic renewal. Provider token refresh/reconnection needs separately confirmed authority; never paste credentials into the website or chat.",
  ].join("\n");
}

export const testingAccessStatusSchema = z.strictObject({
  window: z.enum(["active", "expired", "unavailable"]),
  expiresAt: z.iso.datetime().nullable(),
  scopes: z.strictObject({ customer: z.boolean(), studio: z.boolean() }),
});
