import type OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";
import { DEEPSEEK_MODEL, MODEL_OUTPUT_TOKENS } from "../model-policy";

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
}): OpenAI.Responses.ResponseCreateParamsNonStreaming {
  return {
    model: DEEPSEEK_MODEL,
    store: false,
    max_output_tokens: MODEL_OUTPUT_TOKENS,
    reasoning: { effort: "none" },
    instructions: options.prompt,
    input: [{ role: "user", content: options.payload }],
    text: {
      format: {
        type: "json_schema",
        name: options.name,
        strict: true,
        schema: deepseekSchema(
          zodTextFormat(options.schema, options.name).schema,
        ),
      },
    },
  };
}
