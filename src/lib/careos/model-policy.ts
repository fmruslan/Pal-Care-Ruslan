// Reviewed 2026-10-26 against OpenAI's GPT-6.1 Sol model/Responses documentation.
// A single production model, effort and standard service tier for both scopes.
export const MODEL = "gpt-6.1-sol";
export const REASONING = "medium";
export const MODEL_OUTPUT_TOKENS = 6000; // Includes hidden reasoning, not just visible JSON.
export const MODEL_REQUEST_BYTES = 20000; // Entire serialized request incl. schema/instructions.
export const SOL_RESERVATION_MICRO = 120000;
export const MODEL_TIMEOUT_MS = 22000;
export const TURN_DEADLINE_MS = 50000;
export const EVALUATION_MAX_MICRO = 5000000;

export type ModelUsage = {
  model: typeof MODEL;
  reasoning: typeof REASONING;
  inputTokens: number;
  cachedTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  micro: number;
  latencyMs: number;
  pricingVersion: "sol-standard-2026-10-26";
  schemaName?: string;
  promptVersion?: string;
};

// Micro-USD/token: standard input 2, cache read .1, 30m cache write 2.5,
// output 10. Reasoning tokens are INCLUDED in output_tokens, never charged twice.
// Integer deci-micro arithmetic avoids under-rounding and floating-point drift.
export function pricedUsage(
  raw: unknown,
  latencyMs: number,
): ModelUsage | null {
  if (!raw || typeof raw !== "object") return null;
  const u = raw as Record<string, unknown>;
  const input = u.input_tokens,
    output = u.output_tokens,
    total = u.total_tokens;
  const details = u.input_tokens_details as Record<string, unknown> | undefined;
  const out = u.output_tokens_details as Record<string, unknown> | undefined;
  const cached = details?.cached_tokens,
    written = details?.cache_write_tokens;
  const reasoning = out?.reasoning_tokens;
  const numbers = [input, output, total, cached, written, reasoning];
  if (
    !numbers.every(
      (v) =>
        typeof v === "number" &&
        Number.isSafeInteger(v) &&
        v >= 0 &&
        v <= 1000000,
    )
  )
    return null;
  const [i, o, t, c, w, r] = numbers as number[];
  if (c + w > i || r > o || t !== i + o) return null;
  const micro = Math.ceil(((i - c - w) * 20 + c + w * 25 + o * 100) / 10);
  return {
    model: MODEL,
    reasoning: REASONING,
    inputTokens: i,
    cachedTokens: c,
    cacheWriteTokens: w,
    outputTokens: o,
    reasoningTokens: r,
    micro,
    latencyMs,
    pricingVersion: "sol-standard-2026-10-26",
  };
}
