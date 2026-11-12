import type OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";
import { DEEPSEEK_MODEL, MODEL_OUTPUT_TOKENS } from "../model-policy";

const northEnvelope = `Return every required field with exactly the supplied enum values, never invented enums. For records, productAction defaults to "summary"; preserve "explain" for explanation/chart discussion (no chart execution), "concise" for supported two-bullet style and "scope-first" for explicit scope-first presentation. For guidance use productAction "summary". Creating a chart uses task "records", query.operation "breakdown", query.format "chart"; category predicates belong in query.categories, never productAction. Use "" only for unused productSearch, careQuestion and clarification, null for unused comparison. guide is null except guidance, which requires the complete guide object. Preserve requested filters, named-product search, owned followup scope and explicit comparison periods; defaults apply ONLY to unused fields.
Complete shape example for a fresh all-purchases chart, not a replacement for interpreting the original question or its scope:
{"task":"records","relation":"fresh","query":{"outcome":"query","operation":"breakdown","format":"chart","from":null,"to":null,"categories":[],"origin":"all","receipt":"any","document":"any","price":"any","search":""},"comparison":null,"productSearch":"","productAction":"summary","careQuestion":"","clarification":"","guide":null}`;

/** Provider grammar only. Unsupported length/item/date constraints remain
 * in trusted descriptions and are still enforced by the ORIGINAL Zod parser.
 * Property names and literal values are never interpreted as schema keywords. */
export function deepseekSchema(
  schema: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const constraints: string[] = [];
  for (const [key, value] of Object.entries(schema)) {
    if (key === "$schema") continue;
    if (
      ["minLength", "maxLength", "minItems", "maxItems"].includes(key) ||
      (key === "format" &&
        !["email", "hostname", "ipv4", "ipv6", "uuid"].includes(String(value)))
    ) {
      constraints.push(`${key}=${JSON.stringify(value)}`);
      continue;
    }
    if (key === "const") {
      result.enum = [value];
      continue;
    }
    if (
      ["properties", "$defs", "$def", "definitions"].includes(key) &&
      value &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      result[key] = Object.fromEntries(
        Object.entries(value).map(([name, node]) => [
          name,
          deepseekSchema(node as Record<string, unknown>),
        ]),
      );
    } else if (
      ["anyOf", "oneOf", "allOf", "prefixItems"].includes(key) &&
      Array.isArray(value)
    ) {
      result[key] = value.map((node) =>
        deepseekSchema(node as Record<string, unknown>),
      );
    } else if (
      ["items", "additionalProperties", "not"].includes(key) &&
      value &&
      typeof value === "object" &&
      !Array.isArray(value)
    ) {
      result[key] = deepseekSchema(value as Record<string, unknown>);
    } else result[key] = value;
  }
  if (constraints.length)
    result.description = [
      result.description,
      `Application validation requires: ${constraints.join("; ")}.`,
    ]
      .filter(Boolean)
      .join(" ");
  return result;
}

/** One pure body shared by preflight and dispatch; no retries or raw-text path. */
export function deepseekRequestBody(options: {
  payload: string;
  prompt: string;
  schema: z.ZodType;
  name: string;
}): OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming & {
  thinking: { type: "disabled" };
} {
  const prompt =
    options.name === "north_conversation_v1"
      ? `${options.prompt}\n${northEnvelope}`
      : options.prompt;
  return {
    model: DEEPSEEK_MODEL,
    stream: false,
    max_tokens: MODEL_OUTPUT_TOKENS,
    thinking: { type: "disabled" },
    messages: [
      {
        role: "system",
        content: `${prompt}\nThe single provided function is ONLY serialization of a read-only proposal, not execution, external access or authority. Return exactly one call to that function with the complete schema-valid object. Do not emit prose, other calls or claims that any action executed.`,
      },
      { role: "user", content: options.payload },
    ],
    tools: [
      {
        type: "function",
        function: {
          name: options.name,
          strict: true,
          parameters: deepseekSchema(
            zodTextFormat(options.schema, options.name).schema,
          ),
        },
      },
    ],
    tool_choice: { type: "function", function: { name: options.name } },
  };
}

/** Normalize documented Chat usage to the existing conservative price ledger.
 * Contradictory cache evidence remains unknown, never silently undercharged. */
export function deepseekChatUsage(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return null;
  const u = raw as Record<string, unknown>;
  const detail = u.prompt_tokens_details as Record<string, unknown> | undefined;
  const hits = u.prompt_cache_hit_tokens ?? detail?.cached_tokens ?? 0;
  if (
    u.prompt_cache_hit_tokens !== undefined &&
    detail?.cached_tokens !== undefined &&
    u.prompt_cache_hit_tokens !== detail.cached_tokens
  )
    return null;
  if (
    u.prompt_cache_miss_tokens !== undefined &&
    (typeof hits !== "number" ||
      typeof u.prompt_cache_miss_tokens !== "number" ||
      hits + u.prompt_cache_miss_tokens !== u.prompt_tokens)
  )
    return null;
  return {
    input_tokens: u.prompt_tokens,
    output_tokens: u.completion_tokens,
    total_tokens: u.total_tokens,
    input_tokens_details: { cached_tokens: hits },
    output_tokens_details: {
      reasoning_tokens:
        (u.completion_tokens_details as Record<string, unknown> | undefined)
          ?.reasoning_tokens ?? 0,
    },
  };
}
