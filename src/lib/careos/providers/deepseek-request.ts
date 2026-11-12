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
}): OpenAI.Responses.ResponseCreateParamsNonStreaming {
  return {
    model: DEEPSEEK_MODEL,
    store: false,
    max_output_tokens: MODEL_OUTPUT_TOKENS,
    reasoning: { effort: "none" },
    instructions:
      options.name === "north_conversation_v1"
        ? `${options.prompt}\n${northEnvelope}`
        : options.prompt,
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
