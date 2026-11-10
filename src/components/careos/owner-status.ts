import { z } from "zod";
import { browserAccessSchema } from "./browser-access-state";
import { QUESTION_MAX_STAGES } from "@/lib/careos/campaign-execution";

export const ownerStatusSchema = z.object({
  remembered: z.boolean(),
  browserAccess: browserAccessSchema.optional(),
  liveEnabled: z.boolean(),
  policy: z.enum(["approved", "disabled"]),
  revoked: z.boolean(),
  providerBlocked: z.boolean(),
  remaining: z.number().int().nonnegative(),
  provider: z.string(),
  campaign: z
    .object({
      executionLimit: z.union([z.literal(150), z.literal(163), z.literal(263)]),
      availableForNewQuestion: z.number().int().nonnegative(),
      questionActive: z.boolean(),
      maxQuestionStages: z.literal(QUESTION_MAX_STAGES),
      authorized: z.boolean().optional(),
    })
    .nullable()
    .optional(),
  browserCompletion: z
    .enum(["not-verified", "finish-needed", "complete"])
    .optional(),
});
export type OwnerSendState =
  | "checking"
  | "ready"
  | "signin"
  | "disabled"
  | "exhausted"
  | "busy"
  | "provider"
  | "unavailable";
export function ownerSendState(raw: unknown): OwnerSendState {
  const parsed = ownerStatusSchema.safeParse(raw);
  if (!parsed.success) return "unavailable";
  const s = parsed.data;
  if (!s.remembered) return "signin";
  if (!s.liveEnabled || s.policy !== "approved" || s.revoked) return "disabled";
  if (s.campaign?.authorized === false) return "disabled";
  if (s.remaining === 0) return "exhausted";
  if (s.campaign?.questionActive) return "busy";
  if (s.campaign && s.campaign.availableForNewQuestion < QUESTION_MAX_STAGES)
    return "exhausted";
  if (
    s.providerBlocked ||
    ["Sign in required", "Connection needs review"].includes(s.provider)
  )
    return "provider";
  // An expired access token is not an expired owner/policy. Normal authorized
  // refresh happens server-side only when a real request is sent.
  return "ready";
}
export const ownerSendMessage: Record<OwnerSendState, string> = {
  checking: "Checking your North connection…",
  ready: "North Star is ready in this browser.",
  signin:
    "Connect this browser through AI access to ask North. Your draft is kept.",
  disabled:
    "North’s AI assistance isn’t enabled here. You can still browse purchases, documents and Insights.",
  exhausted:
    "North has reached the available question limit. Your saved purchases, answers and documents are still available.",
  busy: "North is still working on an earlier question. Check for its answer before asking another; your draft is kept.",
  provider:
    "Your ChatGPT connection needs attention. Your saved purchases and Insights still work.",
  unavailable:
    "We couldn’t check your North connection. Your draft is kept; you can still browse your purchases.",
};
