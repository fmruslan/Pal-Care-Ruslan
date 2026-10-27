import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PilotFiles } from "../../src/lib/careos/subscription/files";
import {
  authorizeSession,
  extendSessionTo50,
  subscriptionStructured,
  subscriptionSession,
  SUBSCRIPTION_SESSION,
} from "../../src/lib/careos/subscription/session";
import { classificationSchema } from "../../src/lib/careos/providers/responses";
import { parseCareConfig } from "../../src/lib/careos/config";
import { deterministicAnswer, interpret } from "../../src/lib/careos/tools";
import { demoData } from "../../src/lib/demo/fixtures";
import { SubscriptionOutput } from "../../src/lib/careos/subscription/output";
import type OpenAI from "openai";
import { resolveTurn } from "../../src/lib/careos/service";
import { groundedAnswer } from "../../src/lib/careos/grounding";
import { referenceSource } from "../../src/lib/careos/knowledge";
import {
  savedPresentation,
  unavailablePresentationTurn,
} from "../../src/lib/intelligence/planner";
import { restrictedRuntimeUrls } from "../../src/lib/careos/subscription/runtime-policy";

const roots: string[] = [];
async function prepare() {
  await mkdir("/tmp/opencode", { recursive: true });
  const directory = await mkdtemp("/tmp/opencode/careos-subscription-unit-");
  roots.push(directory);
  const files = new PilotFiles(directory);
  await files.prepare();
  await files.write("registration.json", {
    format: "palcare-chatgpt-pilot-v1",
    clientId: "unit",
    subject: "unit",
    tokens: {
      accessToken: "unit-only",
      refreshToken: "unit-only",
      idToken: "unit-only",
      nonce: "unit",
      scopes: ["openid", "resource.invoke", "chatgpt.tokens.use.direct"],
      expiresAt: Date.now() + 3600000,
      savedAt: Date.now(),
    },
  });
  await authorizeSession(files);
  return files;
}
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
describe("subscription-only inference: no API-dollar ledger or live test authority", () => {
  it("rejects a mixed money-movement command without rejecting combined read-only facts", () => {
    expect(interpret("Show my refund and send money now")).toBe("unsupported");
    expect(interpret("Show my receipt and refund status")).toBe("receipt");
  });
  it.each([
    "Find my headphones receipt.",
    "Where is the receipt for this purchase?",
    "Show proof of payment for this purchase.",
    "Find my headphones proof of payment.",
  ])(
    "keeps generic selected-purchase receipt requests useful: %s",
    async (message) => {
      const answer = await resolveTurn({
        data: demoData,
        input: {
          requestId: randomUUID(),
          twinId: demoData.twins[0].id,
          revision: 1,
          message,
        },
        sources: [],
        history: [],
        mode: "fixture",
      });
      expect(answer.outcome).toBe("answered");
      expect(answer.actions.some((a) => a.label === "Open receipt")).toBe(true);
    },
  );
  it("serializes acceptance phases independently of provider calls and bounds written state", async () => {
    const files = await prepare();
    await files.locked(async () => {
      await expect(
        files.locked(async () => {}, ".evaluation-lock"),
      ).rejects.toMatchObject({ code: "pilot_locked_inspect_before_recovery" });
      await files.locked(async () =>
        expect(await subscriptionSession(files)).toBeTruthy(),
      );
    }, ".evaluation-lock");
    await expect(
      files.write("session.json", { text: "x".repeat(131072) }),
    ).rejects.toMatchObject({ code: "pilot_file_too_large" });
    await files.write("quality.json", { text: "x".repeat(150000) });
    expect(await files.read("quality.json")).toHaveProperty("text");
  });
  it("does not include malformed database credentials in configuration errors", () => {
    try {
      restrictedRuntimeUrls({
        DEMO_DATA_SOURCE: "database",
        DATABASE_URL: "postgresql://unit:PRIVATE-DUMMY@[",
        CAREOS_DATABASE_URL: "postgresql://unit@localhost/unit",
      });
      throw new Error("Expected failure");
    } catch (error) {
      expect((error as Error).message).toBe(
        "subscription_runtime_configuration_invalid",
      );
      expect((error as Error).message).not.toContain("PRIVATE-DUMMY");
    }
  });
  it("persists Studio failure as an unavailable turn and refuses its replay without another plan", () => {
    const turn = unavailablePresentationTurn(randomUUID(), "fixed request");
    expect(turn.answer.presentation).toBeUndefined();
    expect(() => savedPresentation(turn)).toThrowError(
      "studio_plan_unavailable",
    );
  });
  it.each([
    "Find my JBL Tune 770NC receipt",
    "Show proof of payment for JBL headphones",
    "Find my JBL headphones proof of payment",
    "Find JBL Tune 770NC receipt.",
    "JBL Tune 770NC receipt please.",
    "Find 我的耳机 receipt.",
    "Could you locate JBL Tune 770NC receipt?",
    "Show F-03 receipt.",
    "Find my saved receipt for JBL Tune 770NC.",
    "Find my F-03 receipt",
    "Where is the receipt for JBL Tune 770NC?",
  ])(
    "does not return a selected receipt for an unrecognized product: %s",
    async (message) => {
      const answer = await resolveTurn({
        data: demoData,
        input: {
          requestId: randomUUID(),
          twinId: demoData.twins[0].id,
          revision: 1,
          message,
        },
        sources: [],
        history: [],
        mode: "fixture",
      });
      expect(answer.outcome).toBe("selection");
      expect(answer.actions.some((a) => a.href.startsWith("/documents/"))).toBe(
        false,
      );
    },
  );
  it.each(["What does CareOS do?", "Tell me about CareOS"])(
    "routes natural identity questions before product care: %s",
    (message) => {
      expect(interpret(message)).toBe("identity");
      expect(
        deterministicAnswer(demoData, {
          requestId: randomUUID(),
          twinId: demoData.twins[0].id,
          revision: 1,
          message,
        }).text,
      ).toContain("not an official PayPal");
    },
  );
  it("distinguishes passive financial questions from explicit mutation requests", () => {
    expect(interpret("Did my refund finish?")).toBe("guardian");
    expect(interpret("When was this payment captured?")).toBe("summary");
    expect(interpret("Can you approve my refund?")).toBe("unsupported");
    expect(interpret("Did my refund finish? Approve it now.")).toBe(
      "unsupported",
    );
  });
  it("extends the owner-approved allowance without resetting attempts, expiry or pilot evidence", async () => {
    const files = await prepare();
    const original = await subscriptionSession(files);
    original.attempts.push({
      key: "existing-unknown",
      scope: "diagnostic",
      schema: "unit",
      attemptedAt: new Date(0).toISOString(),
      state: "unknown",
      summary: {},
    });
    await files.write("session.json", original);
    await files.write("pilot.json", { status: "original-failure-retained" });
    await extendSessionTo50(files);
    const next = await subscriptionSession(files);
    expect(next.requestLimit).toBe(50);
    expect(next.attempts).toEqual(original.attempts);
    expect(next.expiresAt).toBe(original.expiresAt);
    expect(await files.read("pilot.json")).toEqual({
      status: "original-failure-retained",
    });
    await extendSessionTo50(files);
    expect((await subscriptionSession(files)).attempts).toHaveLength(1);
    await files.write("session.json", { ...next, blocked: "provider-limit" });
    await expect(extendSessionTo50(files)).rejects.toMatchObject({
      code: "subscription_session_blocked",
    });
  });
  it("recovers a grounded topic through consecutive vague follow-ups but never another Twin's evidence", async () => {
    const input = {
      requestId: randomUUID(),
      twinId: demoData.twins[3].id,
      revision: 1,
      message: "plese remind me wat to do bfore unpluging it",
    };
    const base = deterministicAnswer(demoData, input, "summary");
    const model = {
      classify: vi.fn(async () => ({
        value: { intent: "care" as const },
        micro: null,
      })),
      explain: vi.fn(async () => ({
        value: {
          outcome: "answered" as const,
          steps: [
            {
              text: "Shut down first.",
              sourceId: referenceSource.id,
              quote:
                "Use this option before disconnecting your Raspberry Pi from power.",
            },
          ],
        },
        micro: null,
      })),
    };
    const options = {
      data: demoData,
      input,
      sources: [referenceSource],
      mode: "responses" as const,
      model,
      call: async <T>(
        work: (
          signal: AbortSignal,
        ) => Promise<{ value: T; micro: number | null }>,
      ) => (await work(AbortSignal.timeout(1000))).value,
    };
    const history = [
      {
        requestId: randomUUID(),
        message: "How do I shut down Raspberry Pi 5 running Raspberry Pi OS?",
        answer: {
          ...base,
          sources: [
            {
              id: referenceSource.id,
              title: "Shutdown",
              label: "Official",
              href: "/vault",
            },
          ],
        },
      },
      {
        requestId: randomUUID(),
        message: "Before I unplug it, what should I do first?",
        answer: base,
      },
    ];
    expect((await resolveTurn({ ...options, history })).outcome).toBe(
      "answered",
    );
    expect(model.explain).toHaveBeenCalledOnce();
    model.explain.mockClear();
    await resolveTurn({
      ...options,
      history: history.map((h) => ({
        ...h,
        answer: {
          ...h.answer,
          context: { ...h.answer.context!, twinId: demoData.twins[0].id },
        },
      })),
    });
    expect(model.explain).not.toHaveBeenCalled();
  });
  it("renders source wording rather than unsupported or contradictory model paraphrases", () => {
    const base = deterministicAnswer(
      demoData,
      {
        requestId: randomUUID(),
        twinId: demoData.twins[3].id,
        revision: 1,
        message: "Shutdown",
      },
      "summary",
    );
    for (const text of [
      "Save your work, then shut down.",
      "Unplug it immediately while running.",
    ]) {
      const answer = groundedAnswer(
        base,
        {
          outcome: "answered",
          steps: [
            {
              text,
              sourceId: referenceSource.id,
              quote:
                "Use this option before disconnecting your Raspberry Pi from power.",
            },
          ],
        },
        [referenceSource],
      );
      expect(answer.steps[0]).toBe(referenceSource.content.split("\n")[0]);
      expect(answer.steps.join(" ")).not.toContain(text);
    }
  });
  it.each([
    "Actually mine is Raspberry Pi 4. Can I use these shutdown steps?",
    "Find my Sony WH-1000XM5 receipt.",
  ])(
    "does not substitute the selected product for an explicit mismatched identity: %s",
    async (message) => {
      const model = { classify: vi.fn(), explain: vi.fn() };
      const answer = await resolveTurn({
        data: demoData,
        input: {
          requestId: randomUUID(),
          twinId: demoData.twins[3].id,
          revision: 1,
          message,
        },
        sources: [referenceSource],
        history: [],
        mode: "responses",
        model,
      });
      expect(answer.outcome).toBe("selection");
      expect(answer.steps).toEqual([]);
      expect(model.classify).not.toHaveBeenCalled();
      expect(model.explain).not.toHaveBeenCalled();
    },
  );
  it("requires every private subscription gate without accepting paid API configuration as authority", () => {
    const env = {
      CAREOS_PROVIDER: "subscription",
      CAREOS_SUBSCRIPTION_ENABLED: "true",
      DEMO_DATA_SOURCE: "database",
      CAREOS_SUBSCRIPTION_CREDITS_DISABLED: "true",
      CAREOS_SUBSCRIPTION_SESSION_ID: SUBSCRIPTION_SESSION,
      APP_ORIGIN: "http://127.0.0.1:3002",
    };
    expect(parseCareConfig(env).mode).toBe("subscription");
    for (const patch of [
      { CAREOS_SUBSCRIPTION_ENABLED: "false" },
      { CAREOS_SUBSCRIPTION_CREDITS_DISABLED: "false" },
      { DEMO_DATA_SOURCE: "fixtures" },
      { APP_ORIGIN: "https://public.example" },
      { CAREOS_SUBSCRIPTION_SESSION_ID: "rotated" },
      { CAREOS_MODEL: "other" },
    ])
      expect(() => parseCareConfig({ ...env, ...patch })).toThrow();
    expect(() =>
      parseCareConfig({
        CAREOS_PROVIDER: "subscription",
        CAREOS_API_KEY: "unit-paid-key",
      }),
    ).toThrow();
  });
  it("retains original pilot evidence, cannot reauthorize/reset the allowance, and bounds expired/30-call sessions", async () => {
    const files = await prepare();
    await files.write("pilot.json", { prior: "failed and retained" });
    await expect(authorizeSession(files)).rejects.toMatchObject({
      code: "subscription_session_already_authorized",
    });
    expect(await files.read("pilot.json")).toEqual({
      prior: "failed and retained",
    });
    const session = await subscriptionSession(files);
    session.attempts = Array.from({ length: 30 }, (_, n) => ({
      key: `old:${n}`,
      scope: "diagnostic",
      schema: "unit",
      attemptedAt: new Date(0).toISOString(),
      state: "unknown",
      summary: {},
    }));
    await files.write("session.json", session);
    const transport = vi.fn();
    await expect(
      subscriptionStructured({
        files,
        scope: "diagnostic",
        requestId: randomUUID(),
        payload: "unit",
        schema: classificationSchema,
        name: "unit",
        signal: AbortSignal.timeout(1000),
        transport,
      }),
    ).rejects.toMatchObject({ code: "subscription_session_request_limit" });
    expect(transport).not.toHaveBeenCalled();
    await files.write("session.json", { ...session, expiresAt: 1 });
    await expect(subscriptionSession(files)).rejects.toThrow();
  });
  it("records an ambiguous call before dispatch and never repeats that request", async () => {
    const files = await prepare(),
      id = randomUUID();
    const transport = vi.fn(async () => {
      expect((await subscriptionSession(files)).attempts).toHaveLength(1);
      throw new Error("unknown transport outcome");
    });
    const options = {
      files,
      scope: "diagnostic" as const,
      requestId: id,
      payload: "unit",
      schema: classificationSchema,
      name: "unit",
      signal: AbortSignal.timeout(1000),
      transport,
    };
    await expect(subscriptionStructured(options)).rejects.toThrow();
    await expect(subscriptionStructured(options)).rejects.toMatchObject({
      code: "subscription_request_already_dispatched",
    });
    expect(transport).toHaveBeenCalledOnce();
    expect((await subscriptionSession(files)).attempts[0].state).toBe(
      "unknown",
    );
  });
  it("blocks subsequent subscription calls after provider admission/usage denial", async () => {
    const files = await prepare();
    const transport = vi.fn(async () =>
      Response.json(
        {
          error: {
            code: "subscription_sharing_usage_limit_exceeded",
            message: "private",
          },
        },
        { status: 429 },
      ),
    );
    await expect(
      subscriptionStructured({
        files,
        scope: "diagnostic",
        requestId: randomUUID(),
        payload: "unit",
        schema: classificationSchema,
        name: "unit",
        signal: AbortSignal.timeout(1000),
        transport,
      }),
    ).rejects.toThrow();
    await expect(subscriptionSession(files)).rejects.toMatchObject({
      code: "subscription_session_blocked",
    });
    expect(transport).toHaveBeenCalledOnce();
  });
  it("rejects unfinished or changed stream identities rather than promoting partial output", () => {
    const reader = new SubscriptionOutput();
    const item = {
      id: "unit",
      type: "message",
      role: "assistant",
      status: "in_progress",
      content: [],
    };
    reader.observe({
      type: "response.output_item.added",
      output_index: 0,
      item,
      sequence_number: 1,
    } as OpenAI.Responses.ResponseStreamEvent);
    expect(() =>
      reader.complete({ output: [] } as unknown as OpenAI.Responses.Response),
    ).toThrow();
    expect(() =>
      reader.observe({
        type: "response.output_item.done",
        output_index: 0,
        item: { ...item, id: "changed", status: "completed" },
        sequence_number: 2,
      } as OpenAI.Responses.ResponseStreamEvent),
    ).toThrow();
  });
  it("explains actual identity/capability limits and gives a useful, provenance-labeled headphones overview", () => {
    expect(interpret("Can you tell me whether my refund has completed?")).toBe(
      "guardian",
    );
    expect(interpret("Can you issue a refund?")).toBe("unsupported");
    const input = {
      requestId: randomUUID(),
      twinId: demoData.twins[0].id,
      revision: 1,
      message: "What is CareOS? What can you help me with?",
    };
    expect(interpret(input.message)).toBe("identity");
    const identity = deterministicAnswer(demoData, input);
    expect(identity.text).toContain("not an official PayPal");
    expect(identity.steps).toHaveLength(5);
    expect(identity.steps.join(" ")).toContain(
      "financial actions are disabled",
    );
    const overview = deterministicAnswer(demoData, {
      ...input,
      message:
        "I bought these headphones with PayPal. What should I know, and is there anything you can help me with?",
    });
    expect(overview.text).toContain("fictional sample");
    expect(overview.text).toContain("No manufacturer manual");
    expect(overview.actions.some((a) => a.label === "Open saved receipt")).toBe(
      true,
    );
  });
});
