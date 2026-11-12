import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  deepseekSchema,
  deepseekRequestBody,
  deepseekChatUsage,
} from "../../src/lib/careos/providers/deepseek-request";
import { ResponsesProvider } from "../../src/lib/careos/providers/responses";
describe("DeepSeek grammar subset, strict application validation retained", () => {
  it("adds inactive envelope guidance only to hosted North, retaining explanation semantics and original user data", () => {
    const schema = z.strictObject({ text: z.string() });
    const input = {
      payload: 'Original "unchanged" question',
      prompt: "Trusted original rules",
      schema,
      name: "north_conversation_v1",
    };
    const north = deepseekRequestBody(input);
    expect(north.messages[0].content).toContain('preserve "explain"');
    expect(north.messages[0].content).toContain('"productAction":"summary"');
    expect(north.messages[0].content).toContain(
      "defaults apply ONLY to unused fields",
    );
    expect(north.messages[1]).toEqual({ role: "user", content: input.payload });
    expect(
      deepseekRequestBody({ ...input, name: "customer_plan" }).messages[0]
        .content,
    ).not.toContain("defaults apply ONLY to unused fields");
  });
  it("retains required/extra-key/enum/nullable structure while moving unsupported constraints to descriptions, without mutating the schema", () => {
    const original = {
      type: "object",
      required: ["maxLength", "date", "steps"],
      additionalProperties: false,
      properties: {
        maxLength: { type: "string", minLength: 1, maxLength: 10 },
        date: {
          anyOf: [
            { type: "string", format: "date", pattern: "date-regex" },
            { type: "null" },
          ],
        },
        steps: {
          type: "array",
          maxItems: 5,
          items: { type: "string", const: "fixed" },
        },
      },
    };
    const before = JSON.stringify(original),
      result = deepseekSchema(original);
    expect(result).toMatchObject({
      required: original.required,
      additionalProperties: false,
      properties: {
        maxLength: {
          type: "string",
          description: expect.stringContaining("maxLength=10"),
        },
        date: {
          anyOf: [
            {
              type: "string",
              description: expect.stringContaining('format="date"'),
            },
            { type: "null" },
          ],
        },
        steps: { type: "array", items: { type: "string", enum: ["fixed"] } },
      },
    });
    expect(JSON.stringify(original)).toBe(before);
    expect(
      (result.properties as Record<string, Record<string, unknown>>).maxLength,
    ).not.toHaveProperty("maxLength");
  });
  it("still rejects and accounts a structurally valid response violating the original string bound, exposing only trusted field/code", async () => {
    const schema = z.strictObject({ text: z.string().max(3) });
    const provider = new ResponsesProvider(
      {
        apiKey: "synthetic-test-key-only",
        model: "deepseek-flash",
        baseURL: "https://api.deepseek.com",
      },
      async () =>
        new Response(
          JSON.stringify({
            model: "deepseek-flash",
            usage: {
              prompt_tokens: 100,
              completion_tokens: 10,
              total_tokens: 110,
            },
            choices: [
              {
                finish_reason: "tool_calls",
                message: {
                  role: "assistant",
                  content: null,
                  tool_calls: [
                    {
                      type: "function",
                      function: {
                        name: "bounded_text",
                        arguments: '{"text":"too long private model content"}',
                      },
                    },
                  ],
                },
              },
            ],
          }),
          { headers: { "content-type": "application/json" } },
        ),
    );
    await expect(
      provider.structured(
        "synthetic",
        schema,
        "bounded_text",
        AbortSignal.timeout(1000),
      ),
    ).rejects.toMatchObject({
      code: "careos_model_invalid_output_text_too_big",
      micro: 42,
    });
  });
  it("normalizes Chat usage without silently accepting contradictory cache evidence", () => {
    const raw = {
      prompt_tokens: 100,
      completion_tokens: 10,
      total_tokens: 110,
      prompt_cache_hit_tokens: 20,
      prompt_cache_miss_tokens: 80,
      prompt_tokens_details: { cached_tokens: 20 },
    };
    expect(deepseekChatUsage(raw)).toMatchObject({
      input_tokens: 100,
      output_tokens: 10,
      total_tokens: 110,
      input_tokens_details: { cached_tokens: 20 },
    });
    expect(
      deepseekChatUsage({
        ...raw,
        prompt_tokens_details: { cached_tokens: 30 },
      }),
    ).toBeNull();
    expect(
      deepseekChatUsage({ ...raw, prompt_cache_miss_tokens: 70 }),
    ).toBeNull();
  });
});
