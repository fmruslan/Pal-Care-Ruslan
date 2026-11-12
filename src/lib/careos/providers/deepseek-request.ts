import type OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";
import { DEEPSEEK_MODEL, MODEL_OUTPUT_TOKENS } from "../model-policy";

/** Same strict application schema, in documented JSON mode. DeepSeek rejects
 * North's constrained-decoding schema; it is a trusted instruction here, never
 * executable authority. The original Zod parser still validates every response.
 * Shared with preflight so escaping/schema bytes are measured before dispatch. */
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
    instructions: `${options.prompt}\nReturn only one JSON object matching this JSON Schema exactly, with all required fields and no extra properties:\n${JSON.stringify(zodTextFormat(options.schema, options.name).schema)}`,
    input: [{ role: "user", content: options.payload }],
    text: { format: { type: "json_object" } },
  };
}
