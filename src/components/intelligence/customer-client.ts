import { z } from "zod";
import { customerPlanSchema } from "@/lib/intelligence/customer-commands";

export const insightPendingKey = "palcare-insights-pending-v1";
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
