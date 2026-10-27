import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { randomUUID, createHash } from "node:crypto";
import { PilotFiles, PilotError } from "./files";
import { accessToken, smallJson, RESOURCE, type Transport } from "./auth";
import {
  CARE_INSTRUCTIONS,
  CARE_PROMPT_VERSION,
  classificationSchema,
  explanationSchema,
  type ModelResult,
} from "../providers/responses";
import {
  MODEL,
  REASONING,
  MODEL_REQUEST_BYTES,
  MODEL_TIMEOUT_MS,
} from "../model-policy";
import { resolveTurn } from "../service";
import { demoData } from "../../demo/fixtures";
import { referenceSource, REFERENCE_TWIN } from "../knowledge";
import {
  planDashboard,
  validateDashboardPlan,
} from "../../intelligence/planner";
import { illustrativeDataset } from "../../intelligence/model";
import { SubscriptionOutput, finalStructuredText } from "./output";

export const PILOT_ID = "careos-subscription-sol-medium-phase1-v1";
const tokenCount = z.number().int().nonnegative().max(2000000);
const usageSchema = z
  .object({
    input_tokens: tokenCount,
    output_tokens: tokenCount,
    total_tokens: tokenCount,
    input_tokens_details: z.object({
      cached_tokens: tokenCount,
      cache_write_tokens: tokenCount.optional(),
    }),
    output_tokens_details: z.object({ reasoning_tokens: tokenCount }),
  })
  .refine(
    (u) =>
      u.total_tokens === u.input_tokens + u.output_tokens &&
      u.input_tokens_details.cached_tokens +
        (u.input_tokens_details.cache_write_tokens ?? 0) <=
        u.input_tokens &&
      u.output_tokens_details.reasoning_tokens <= u.output_tokens,
  );
export function subscriptionUsage(raw: unknown) {
  const u = usageSchema.safeParse(raw);
  if (!u.success) throw new PilotError("pilot_usage_missing_or_invalid");
  return {
    inputTokens: u.data.input_tokens,
    outputTokens: u.data.output_tokens,
    totalTokens: u.data.total_tokens,
    cachedTokens: u.data.input_tokens_details.cached_tokens,
    cacheWriteTokens: u.data.input_tokens_details.cache_write_tokens ?? null,
    reasoningTokens: u.data.output_tokens_details.reasoning_tokens,
    billing: "ChatGPT plan; not an API-dollar calculation" as const,
  };
}
const publicErrorCodes = new Set([
  "subscription_sharing_user_not_eligible",
  "subscription_sharing_usage_limit_exceeded",
  "subscription_sharing_usage_unavailable",
  "subscription_sharing_unsupported_capability",
  "subscription_sharing_route_not_supported",
  "subscription_sharing_invalid_user",
  "subscription_sharing_user_unavailable",
  "chatpass_v2_scope_not_authorized",
  "chatpass_v2_invalid_authorization_context",
]);
export function safeFailure(error: unknown) {
  if (error instanceof PilotError) return error.code;
  const code =
    error && typeof error === "object" && "code" in error ? error.code : null;
  return typeof code === "string" && publicErrorCodes.has(code)
    ? code
    : "pilot_failed_no_retry";
}
// Completed inference is NOT accepted on output deltas, HTTP 200, or [DONE] alone.
export async function streamStructured<T extends z.ZodType>(options: {
  accessToken: string;
  payload: string;
  schema: T;
  name: string;
  prompt?: string;
  signal?: AbortSignal;
  beforeDispatch: () => Promise<void>;
  observe: (summary: Record<string, unknown>) => void;
  transport?: Transport;
}): Promise<ModelResult<z.infer<T>>> {
  const body: OpenAI.Responses.ResponseCreateParamsStreaming = {
    model: MODEL,
    reasoning: { effort: REASONING },
    store: false,
    stream: true,
    input: [
      { role: "developer", content: options.prompt ?? CARE_INSTRUCTIONS },
      { role: "user", content: options.payload },
    ],
    text: { format: zodTextFormat(options.schema, options.name) },
  };
  if (Buffer.byteLength(JSON.stringify(body)) > MODEL_REQUEST_BYTES)
    throw new PilotError("pilot_request_too_large");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);
  const started = Date.now();
  let dispatched = false,
    bytes = 0;
  const client = new OpenAI({
    apiKey: options.accessToken,
    adminAPIKey: null,
    baseURL: RESOURCE,
    organization: null,
    project: null,
    maxRetries: 0,
    timeout: MODEL_TIMEOUT_MS,
    logLevel: "off",
    fetch: async (url, init) => {
      if (
        String(url) !== `${RESOURCE}/responses` ||
        init?.method !== "POST" ||
        dispatched
      )
        throw new PilotError("pilot_unexpected_request");
      dispatched = true;
      // Durable attempt marker commits before the ONE HTTP POST. Never refund an
      // unknown attempt or replay it after a crash/timeout.
      await options.beforeDispatch();
      const response = await (options.transport ?? fetch)(url, {
        ...init,
        redirect: "error",
      });
      const requestId = response.headers.get("x-request-id");
      options.observe({
        httpStatus: response.status,
        ...(requestId && /^[A-Za-z0-9_-]{1,128}$/.test(requestId)
          ? { requestId }
          : {}),
      });
      if (!response.body) return response;
      const reader = response.body.getReader();
      const limited = new ReadableStream<Uint8Array>({
        async pull(c) {
          try {
            const { done, value } = await reader.read();
            if (done) {
              c.close();
              return;
            }
            bytes += value.byteLength;
            if (bytes > 1048576) {
              await reader.cancel();
              controller.abort();
              throw new PilotError("pilot_stream_too_large");
            }
            c.enqueue(value);
          } catch (error) {
            c.error(error);
          }
        },
        cancel: () => reader.cancel(),
      });
      return new Response(limited, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    },
  });
  let completed: OpenAI.Responses.Response | undefined;
  const output = new SubscriptionOutput();
  let events = 0,
    textBytes = 0,
    firstEventMs: number | null = null;
  try {
    const stream = await client.responses.create(body, {
      signal: options.signal
        ? AbortSignal.any([controller.signal, options.signal])
        : controller.signal,
    });
    for await (const event of stream) {
      output.observe(event);
      events++;
      firstEventMs ??= Date.now() - started;
      if (event.type === "response.output_text.delta") {
        textBytes += Buffer.byteLength(event.delta);
        if (textBytes > 16000) throw new PilotError("pilot_output_too_large");
      }
      if (event.type === "error")
        throw new PilotError(
          publicErrorCodes.has(event.code ?? "")
            ? event.code!
            : "pilot_stream_error",
        );
      if (
        event.type === "response.failed" ||
        event.type === "response.incomplete"
      ) {
        options.observe({
          latencyMs: Date.now() - started,
          events,
          status: event.response.status,
          usage: event.response.usage
            ? subscriptionUsage(event.response.usage)
            : null,
        });
        const code = event.response.error?.code;
        throw new PilotError(
          code && publicErrorCodes.has(code)
            ? code
            : "pilot_response_not_completed",
        );
      }
      if (event.type === "response.completed") {
        if (completed) throw new PilotError("pilot_duplicate_completion");
        completed = event.response;
        // Continue through stream termination: an error after partial output is failure.
      }
    }
    if (
      !completed ||
      completed.status !== "completed" ||
      completed.model !== MODEL ||
      completed.reasoning?.effort !== REASONING
    )
      throw new PilotError("pilot_completion_or_model_missing");
    const usage = subscriptionUsage(completed.usage);
    const wireOutputItemCount = completed.output.length;
    completed = output.complete(completed);
    options.observe({
      latencyMs: Date.now() - started,
      firstEventMs,
      events,
      status: "completed",
      usage,
      model: completed.model,
      serviceTier: completed.service_tier ?? null,
      schema: options.name,
      promptVersion: CARE_PROMPT_VERSION,
      outputItemCount: completed.output.length,
      wireOutputItemCount,
      outputShape: completed.output.slice(0, 16).map((item) => ({
        type: item.type,
        ...(item.type === "message"
          ? {
              contentTypes: item.content
                .slice(0, 16)
                .map((content) => content.type),
            }
          : {}),
      })),
    });
    const text = finalStructuredText(completed);
    if (Buffer.byteLength(text) > 16000)
      throw new PilotError("pilot_output_too_large");
    try {
      return { value: options.schema.parse(JSON.parse(text)), micro: null };
    } catch {
      throw new PilotError("pilot_structured_output_invalid");
    }
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

const journalSchema = z
  .object({
    id: z.literal(PILOT_ID),
    startedAt: z.string().optional(),
    status: z.enum(["prepared", "running", "PASS", "FAIL"]),
    attempts: z.array(z.record(z.string(), z.unknown())).max(3),
  })
  .passthrough();
export async function preparePilot(files: PilotFiles) {
  await files.hostId();
  const existing = await files.read("pilot.json");
  if (existing) journalSchema.parse(existing);
  else
    await files.write("pilot.json", {
      id: PILOT_ID,
      status: "prepared",
      attempts: [],
    });
}
export async function discoverModel(
  files: PilotFiles,
  transport: Transport = fetch,
) {
  const token = await accessToken(files, transport);
  const data = await smallJson(
    `${RESOURCE}/models`,
    { headers: { Authorization: `Bearer ${token}` } },
    transport,
  );
  const catalog = z
    .object({
      models: z
        .array(z.object({ slug: z.string(), visibility: z.string() }))
        .max(1000),
    })
    .parse(data);
  if (!catalog.models.some((m) => m.slug === MODEL && m.visibility === "list"))
    throw new PilotError("pilot_sol_unavailable_stop");
  return token;
}
export async function runPilot(
  files: PilotFiles,
  approval: { approved: boolean; creditsDisabled: boolean },
  transport: Transport = fetch,
) {
  if (!approval.approved || !approval.creditsDisabled)
    throw new PilotError("pilot_approval_and_no_credit_confirmation_required");
  await preparePilot(files);
  const journal = journalSchema.parse(await files.read("pilot.json"));
  if (journal.startedAt || journal.status !== "prepared")
    throw new PilotError("pilot_already_attempted_inspect_no_retry");
  const r = await files.registration();
  if (!r?.tokens || !r.subject) throw new PilotError("pilot_signin_required");
  const token = await discoverModel(files, transport);
  journal.startedAt = new Date().toISOString();
  journal.status = "running";
  journal.connection = createHash("sha256")
    .update(r.clientId + ":" + r.subject)
    .digest("hex");
  journal.ownerConfirmedCreditsDisabledAt = journal.startedAt;
  await files.write("pilot.json", journal);
  const structured = async <T extends z.ZodType>(
    payload: string,
    schema: T,
    name: string,
    _signal: AbortSignal,
    prompt?: string,
  ) => {
    let attempt: Record<string, unknown> | undefined;
    return streamStructured({
      accessToken: token,
      payload,
      schema,
      name,
      prompt,
      signal: _signal,
      transport,
      beforeDispatch: async () => {
        if (journal.attempts.length >= 3)
          throw new PilotError("pilot_fixed_scenarios_exhausted");
        attempt = {
          schema: name,
          state: "unknown",
          attemptedAt: new Date().toISOString(),
        };
        journal.attempts.push(attempt);
        await files.write("pilot.json", journal);
      },
      observe: (summary) => {
        if (attempt) Object.assign(attempt, summary);
      },
    }).then(
      async (result) => {
        if (attempt) attempt.state = "completed";
        await files.write("pilot.json", journal);
        return result;
      },
      async (error) => {
        if (attempt) attempt.error = safeFailure(error);
        await files.write("pilot.json", journal);
        throw error;
      },
    );
  };
  try {
    const question =
      "How do I shut down Raspberry Pi 5 running Raspberry Pi OS before unplugging power?";
    const classified = await structured(
      JSON.stringify({
        task: "classify",
        question,
        product: { brand: "Raspberry Pi", model: "5" },
        history: [],
      }),
      classificationSchema,
      "careos_intent",
      AbortSignal.timeout(MODEL_TIMEOUT_MS),
    );
    if (classified.value.intent !== "care")
      throw new PilotError("pilot_classification_failed");
    const answer = await resolveTurn({
      data: demoData,
      input: {
        requestId: randomUUID(),
        twinId: REFERENCE_TWIN,
        revision: 1,
        message: question,
        intent: "care",
      },
      sources: [referenceSource],
      history: [],
      mode: "responses",
      model: {
        classify: () => {
          throw new PilotError("pilot_unexpected_extra_classification");
        },
        explain: (payload, signal) =>
          structured(payload, explanationSchema, "careos_care", signal),
      },
      call: async (work) =>
        (await work(AbortSignal.timeout(MODEL_TIMEOUT_MS))).value,
    });
    if (
      answer.outcome !== "answered" ||
      answer.mode !== "live" ||
      !answer.sources.some((s) => s.id === referenceSource.id)
    )
      throw new PilotError("pilot_grounded_care_failed");
    journal.careAnswer = answer; // Fixed fictional/public reference only, never prompts or account data.
    const plan = await planDashboard(
      { structured },
      "Show pending adjustments and add a separate verified-refund summary with its evidence",
      illustrativeDataset,
      AbortSignal.timeout(MODEL_TIMEOUT_MS),
    );
    const validated = validateDashboardPlan(plan.value);
    if (validated.outcome !== "apply")
      throw new PilotError("pilot_dashboard_plan_failed");
    journal.dashboardPlan = validated;
    journal.status = "PASS";
    journal.note =
      "CLI protocol and existing domain contracts passed; human grounding, actual browser execution, runtime accounting/security integration and next-phase approval remain required. No API billing calculation or provider-side token cap claimed.";
  } catch (error) {
    journal.status = "FAIL";
    journal.error = safeFailure(error);
    throw error;
  } finally {
    await files.write("pilot.json", journal);
  }
  return {
    status: journal.status,
    attempts: journal.attempts,
    model: MODEL,
    reasoning: REASONING,
    databaseCalls: 0,
    financialCalls: 0,
    webRuntimeEnabled: false,
  };
}
