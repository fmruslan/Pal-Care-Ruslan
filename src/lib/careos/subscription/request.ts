import type OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";
import { MODEL, REASONING, MODEL_REQUEST_BYTES } from "../model-policy";
import { PilotError } from "./files";

/** Pure wire construction shared by preflight projection and real dispatch.
 * No credential, client, transport, reservation or provider access occurs here. */
export function structuredRequestBody(options: {
  payload: string;
  prompt: string;
  schema: z.ZodType;
  name: string;
}): OpenAI.Responses.ResponseCreateParamsStreaming {
  return {
    model: MODEL,
    reasoning: { effort: REASONING },
    store: false,
    stream: true,
    input: [
      { role: "developer", content: options.prompt },
      { role: "user", content: options.payload },
    ],
    text: { format: zodTextFormat(options.schema, options.name) },
  };
}

export function structuredRequestBytes(body: object) {
  return Buffer.byteLength(JSON.stringify(body));
}

export function assertStructuredRequestSize(body: object) {
  if (structuredRequestBytes(body) > MODEL_REQUEST_BYTES)
    throw new PilotError("pilot_request_too_large");
}
