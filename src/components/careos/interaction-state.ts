import { z } from "zod";
import { careContextSchema, type CareTurn } from "@/lib/careos/contracts";

export const interactionKey = "palcare-careos-interaction-v1";
const interactionSchema = z.strictObject({
  version: z.literal(1),
  context: careContextSchema.nullable(),
  explicit: z.boolean(),
  order: z.array(z.uuid()).max(80).optional(),
  dismissed: z.array(z.uuid()).max(80).optional(),
  draft: z.string().max(2000),
  savedAt: z.number().int().nonnegative(),
});

/** Optional per-tab presentation hint, never history or authorization. */
export function readInteraction(raw: string | null, now = Date.now()) {
  if (!raw || raw.length > 10000) return null;
  try {
    const value = interactionSchema.parse(JSON.parse(raw));
    if (value.savedAt > now || now - value.savedAt >= 86400000) return null;
    return value;
  } catch {
    return null;
  }
}

/** One visible timeline; transport ownership and saved request IDs are unchanged. */
export function mergeAssistantTurns(
  care: CareTurn[],
  insights: CareTurn[],
  submittedOrder: string[],
) {
  const turns = [...care, ...insights];
  const unique = [
    ...new Map(turns.map((turn) => [turn.requestId, turn])).values(),
  ];
  const rank = new Map(
    [...new Set(submittedOrder)].map((id, index) => [id, index]),
  );
  return unique.sort((a, b) => {
    const left = rank.get(a.requestId);
    const right = rank.get(b.requestId);
    if (left === undefined && right === undefined) return 0;
    if (left === undefined) return -1;
    if (right === undefined) return 1;
    return left - right;
  });
}
