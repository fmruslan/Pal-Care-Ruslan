import { z } from "zod";

export const ownerStatusSchema = z.object({
  remembered: z.boolean(),
  liveEnabled: z.boolean(),
  policy: z.enum(["approved", "disabled"]),
  revoked: z.boolean(),
  providerBlocked: z.boolean(),
  remaining: z.number().int().nonnegative(),
  provider: z.string(),
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
  | "provider"
  | "unavailable";
export function ownerSendState(raw: unknown): OwnerSendState {
  const parsed = ownerStatusSchema.safeParse(raw);
  if (!parsed.success) return "unavailable";
  const s = parsed.data;
  if (!s.remembered) return "signin";
  if (!s.liveEnabled || s.policy !== "approved" || s.revoked) return "disabled";
  if (s.remaining === 0) return "exhausted";
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
  checking: "Checking this browser’s AI access…",
  ready: "This browser is remembered. CareOS is ready.",
  signin:
    "This browser is not verified yet. Open AI access to finish remembering this browser; your draft is kept.",
  disabled:
    "AI permission is not enabled for this browser. Your saved purchases and Insights still work.",
  exhausted:
    "Your approved AI usage limit has been reached. Your saved records are still available.",
  provider:
    "Your ChatGPT connection needs attention. Your saved purchases and Insights still work.",
  unavailable:
    "Couldn’t check AI access. Your draft is kept. Check the connection and try again.",
};
