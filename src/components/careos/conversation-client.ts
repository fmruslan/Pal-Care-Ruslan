import { z } from "zod";
import { turnSchema, type CareContext } from "@/lib/careos/contracts";

export const conversationKey = "palcare-careos-conversation";
export const pendingKey = "palcare-careos-pending-v1";
const pendingSchema = z.strictObject({
  input: turnSchema,
  context: z
    .strictObject({
      twinId: z.uuid().nullable(),
      example: z.literal("insignia").optional(),
      name: z.string().max(200),
      model: z.string().max(200),
      origin: z.string().max(40),
    })
    .nullable(),
  conversationId: z.uuid().nullable(),
  createdAt: z.number(),
});
export type PendingQuestion = z.infer<typeof pendingSchema> & {
  status: "sending" | "uncertain" | "not-sent";
};

// Browser storage is only a recovery hint. It never grants authority or triggers a POST.
export function readPending(raw: string | null, now = Date.now()) {
  if (!raw || raw.length > 8192) return null;
  try {
    const value = pendingSchema.parse(JSON.parse(raw ?? "null"));
    if (
      now < value.createdAt ||
      now - value.createdAt >= 86400000 ||
      value.input.twinId !== (value.context?.twinId ?? null) ||
      value.input.example !== value.context?.example
    )
      return null;
    return {
      ...value,
      status: value.conversationId ? "uncertain" : "not-sent",
    } as PendingQuestion;
  } catch {
    return null;
  }
}

export function contextIdentity(context: CareContext | null | undefined) {
  return (
    context?.twinId ??
    (context?.example ? `example:${context.example}` : "general")
  );
}

export class CareHttpError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(
      code === "careos_owner_signin_required"
        ? "Please verify this browser in AI access. Your saved purchases and documents are still available."
        : code === "careos_owner_provider_reconnect" ||
            code === "careos_owner_provider_unavailable"
          ? "Your ChatGPT connection needs attention. Your purchases, documents and Insights are still available."
          : code === "careos_owner_ai_disabled"
            ? "AI is not enabled. You can still explore your purchases, documents and Insights."
            : code === "careos_owner_quota_exhausted"
              ? "Your approved AI usage limit has been reached. Your saved records are still available."
              : code === "careos_owner_busy" ||
                  code === "careos_owner_rate_limited"
                ? "CareOS is busy. Please wait a moment before asking again."
                : code === "careos_request_unknown"
                  ? "This request has no confirmed result yet. Check for a saved answer; it will not be sent again."
                  : code === "careos_request_conflict"
                    ? "This request conflicts with an earlier submission. It will not be sent again."
                    : code === "careos_turn_in_progress"
                      ? "An answer may still be in progress. Check for a saved answer shortly."
                      : status === 429
                        ? "CareOS has reached its demo limit. Please try later; your documents are still available."
                        : status === 403
                          ? "CareOS access is unavailable or expired. Your question has not been resent."
                          : status === 404
                            ? "This saved conversation is no longer available. Clear it to start again."
                            : "CareOS is temporarily unavailable. You can still open your purchases and documents directly.",
    );
  }
}

export function careMessage(error: unknown) {
  return error instanceof CareHttpError
    ? error.message
    : "CareOS is temporarily unavailable. You can still open your purchases and documents directly.";
}

export async function careApi<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const response = await fetch(`/api/careos/conversations${path}`, {
    method,
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(65000),
  });
  if (!response.ok) {
    const value = await response.json().catch(() => null);
    // Never render server/provider text. Only these local messages reach the UI.
    throw new CareHttpError(
      response.status,
      typeof value?.error === "string" ? value.error : "",
    );
  }
  return response.json() as Promise<T>;
}
