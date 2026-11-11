import { z } from "zod";
import { customerPlanSchema } from "@/lib/intelligence/customer-commands";
import { ensureGuestAccess } from "../careos/guest-client";

export const insightPendingKey = "palcare-insights-pending-v1";
export const insightHistoryKey = "palcare-insights-history-v1";
const displayEnvelope = z.strictObject({
  scope: z.literal("customer-studio"),
  message: z.string().min(1).max(500),
});
/** Decode original server-owned message envelopes for display only; never rewrite fingerprints. */
export function customerQuestionText(message: string) {
  if (!message.trimStart().startsWith("{"))
    return message.length <= 500
      ? message
      : "Saved Insights question (display text unavailable).";
  try {
    return displayEnvelope.parse(JSON.parse(message)).message;
  } catch {
    return "Saved Insights question (display text unavailable).";
  }
}
const historySchema = z
  .array(
    z.strictObject({
      conversationId: z.uuid(),
      requestId: z.uuid(),
      createdAt: z.number().int().positive(),
    }),
  )
  .max(40);
export type InsightHistoryEntry = z.infer<typeof historySchema>[number];
/** IDs only; content must be restored through the original protected owned GET. */
export function readInsightHistory(
  raw: string | null,
  now = Date.now(),
): InsightHistoryEntry[] {
  if (!raw || raw.length > 8192) return [];
  try {
    return historySchema
      .parse(JSON.parse(raw))
      .filter(
        (entry) => entry.createdAt <= now && now - entry.createdAt < 86400000,
      );
  } catch {
    return [];
  }
}
const schema = z.strictObject({
  requestId: z.uuid(),
  message: z.string().min(1).max(500),
  conversationId: z.uuid().nullable(),
  createdAt: z.number().int().positive(),
  plan: customerPlanSchema.optional(),
});
export type InsightPending = z.infer<typeof schema>;
export function readInsightPending(
  raw: string | null,
  now = Date.now(),
): InsightPending | null {
  if (!raw || raw.length > 8192) return null;
  try {
    const value = schema.parse(JSON.parse(raw));
    return value.createdAt <= now && now - value.createdAt < 86400000
      ? value
      : null;
  } catch {
    return null;
  }
}

const conversationMissing = "careos_conversation_not_found";
export class CustomerPlanHttpError extends Error {
  readonly code: string;
  constructor(
    public readonly status: number,
    code?: string,
  ) {
    // Neither the message nor the retained code contains arbitrary server text.
    super("customer_plan_unavailable");
    this.name = "CustomerPlanHttpError";
    this.code =
      code === conversationMissing ? code : "customer_plan_unavailable";
  }
}

/** Only an authenticated route's specific missing-conversation result is final. */
export function canForgetCustomerConversation(error: unknown): boolean {
  return (
    error instanceof CustomerPlanHttpError &&
    error.status === 404 &&
    error.code === conversationMissing
  );
}

async function isMissingConversation(response: Response): Promise<boolean> {
  if (
    response.status !== 404 ||
    response.redirected ||
    response.headers.get("content-type")?.split(";")[0].trim() !==
      "application/json"
  )
    return false;
  const reader = response.body?.getReader();
  if (!reader) return false;
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 1024) {
        await reader.cancel();
        return false;
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
    return z
      .strictObject({ error: z.literal(conversationMissing) })
      .safeParse(JSON.parse(text)).success;
  } catch {
    // Malformed, interrupted and unknown responses never authorize forgetting.
    return false;
  } finally {
    reader.releaseLock();
  }
}

export async function customerPlanApi<T>(
  method: "GET" | "POST" | "DELETE",
  body?: unknown,
  conversationId?: string,
  signal?: AbortSignal,
): Promise<T> {
  if (method === "POST") await ensureGuestAccess();
  const response = await fetch(
    `/api/intelligence/customer/plan${conversationId ? `?conversationId=${encodeURIComponent(conversationId)}` : ""}`,
    {
      method,
      cache: "no-store",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(60000)])
        : AbortSignal.timeout(60000),
    },
  );
  if (!response.ok)
    throw new CustomerPlanHttpError(
      response.status,
      (await isMissingConversation(response)) ? conversationMissing : undefined,
    );
  return response.json() as Promise<T>;
}
