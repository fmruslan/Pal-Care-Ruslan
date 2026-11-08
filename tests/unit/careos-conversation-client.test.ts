import { describe, expect, it } from "vitest";
import {
  CareHttpError,
  contextIdentity,
  readPending,
  readUnsent,
} from "@/components/careos/conversation-client";
import { ownerSendState } from "@/components/careos/owner-status";
import {
  browserAccessSchema,
  browserAccessMessage,
} from "@/components/careos/browser-access-state";

const snapshot = {
  input: {
    requestId: "00000000-0000-4000-8000-000000000001",
    twinId: null,
    revision: 3,
    message: "Find receipt",
  },
  context: null,
  conversationId: "00000000-0000-4000-8000-000000000002",
  createdAt: 1000,
};
describe("CareOS browser recovery hints", () => {
  it("retains known-unsent drafts without downgrading uncertain dispatched envelopes", () => {
    const unsent = { ...snapshot, conversationId: null };
    expect(readUnsent(JSON.stringify([unsent, snapshot]), 2000)).toHaveLength(
      1,
    );
    expect(readUnsent(JSON.stringify([unsent]), 2000)[0].input).toEqual(
      snapshot.input,
    );
    expect(readUnsent(JSON.stringify([unsent]), 86401000)).toEqual([]);
    expect(readUnsent("x".repeat(81921), 2000)).toEqual([]);
    expect(
      readUnsent(
        JSON.stringify(Array.from({ length: 11 }, () => unsent)),
        2000,
      ),
    ).toEqual([]);
  });
  it("checks actual browser recognition separately from active policy/provider refresh", () => {
    const status = {
      remembered: true,
      liveEnabled: true,
      policy: "approved",
      revoked: false,
      providerBlocked: false,
      remaining: 298,
      provider: "Refresh needed before authorized use",
    };
    expect(ownerSendState(status)).toBe("ready");
    expect(
      ownerSendState({
        ...status,
        remaining: 100,
        campaign: {
          executionLimit: 263,
          availableForNewQuestion: 100,
          questionActive: false,
          maxQuestionStages: 2,
          authorized: true,
        },
      }),
    ).toBe("ready");
    expect(ownerSendState({ ...status, remembered: false })).toBe("signin");
    expect(ownerSendState({ ...status, revoked: true })).toBe("disabled");
    expect(ownerSendState({ ...status, remaining: 0 })).toBe("exhausted");
    expect(ownerSendState({ ...status, providerBlocked: true })).toBe(
      "provider",
    );
    expect(ownerSendState({ ...status, provider: "Sign in required" })).toBe(
      "provider",
    );
    expect(ownerSendState({ remembered: true })).toBe("unavailable");
  });
  it("recognizes the server's recovered browser state without bypassing permission, remaining allowance or provider denial", () => {
    const status = {
      remembered: true,
      browserAccess: "recovery-active",
      browserCompletion: "complete",
      originalBrowserRevoked: true,
      recoveryActive: true,
      liveEnabled: true,
      policy: "approved",
      revoked: false,
      providerBlocked: false,
      remaining: 87,
      campaign: {
        executionLimit: 150,
        availableForNewQuestion: 87,
        questionActive: false,
        maxQuestionStages: 2,
      },
      provider: "Connected; capacity not checked",
    };
    expect(browserAccessSchema.parse(status.browserAccess)).toBe(
      "recovery-active",
    );
    expect(browserAccessMessage["recovery-active"]).toContain(
      "original browser credential remains revoked",
    );
    expect(ownerSendState(status)).toBe("ready");
    expect(
      ownerSendState({
        ...status,
        remaining: 1,
        campaign: { ...status.campaign, availableForNewQuestion: 1 },
      }),
    ).toBe("exhausted");
    expect(
      ownerSendState({
        ...status,
        campaign: { ...status.campaign, questionActive: true },
      }),
    ).toBe("busy");
    expect(
      ownerSendState({
        ...status,
        campaign: { ...status.campaign, executionLimit: 300 },
      }),
    ).toBe("unavailable");
    expect(ownerSendState({ ...status, remembered: false })).toBe("signin");
    expect(ownerSendState({ ...status, liveEnabled: false })).toBe("disabled");
    expect(ownerSendState({ ...status, policy: "disabled" })).toBe("disabled");
    expect(ownerSendState({ ...status, revoked: true })).toBe("disabled");
    expect(ownerSendState({ ...status, remaining: 0 })).toBe("exhausted");
    expect(ownerSendState({ ...status, providerBlocked: true })).toBe(
      "provider",
    );
    expect(
      ownerSendState({ ...status, browserAccess: "invented-recovery" }),
    ).toBe("unavailable");
  });
  it("retains the exact envelope but never restores a sending state", () => {
    const restored = readPending(JSON.stringify(snapshot), 2000);
    expect(restored?.input).toEqual(snapshot.input);
    expect(restored?.status).toBe("uncertain");
    expect(
      readPending(JSON.stringify({ ...snapshot, conversationId: null }), 2000)
        ?.status,
    ).toBe("not-sent");
  });
  it("rejects expired, future, corrupt, unbounded and authority-bearing snapshots", () => {
    for (const raw of [
      "bad json",
      "x".repeat(8193),
      "null",
      JSON.stringify({ ...snapshot, createdAt: 3000 }),
      JSON.stringify({
        ...snapshot,
        input: { ...snapshot.input, message: "x".repeat(2001) },
      }),
      JSON.stringify({
        ...snapshot,
        input: { ...snapshot.input, customerId: "forged" },
      }),
      JSON.stringify({
        ...snapshot,
        context: {
          twinId: snapshot.conversationId,
          name: "Other",
          model: "Other",
          origin: "sample",
        },
      }),
    ])
      expect(readPending(raw, 2000)).toBeNull();
    expect(readPending(JSON.stringify(snapshot), 86401000)).toBeNull();
  });
  it("keeps general and reference context identities distinct", () => {
    expect(contextIdentity(null)).toBe("general");
    expect(
      contextIdentity({
        twinId: null,
        example: "insignia",
        name: "Example",
        model: "NS",
        origin: "sample",
      }),
    ).toBe("example:insignia");
  });
  it("restores additive purchase dates while keeping historical undated envelopes and request IDs unchanged", () => {
    const context = {
      twinId: snapshot.conversationId,
      name: "Everyday headphones",
      model: "F-01",
      origin: "sample",
    };
    const original = {
      ...snapshot,
      input: { ...snapshot.input, twinId: context.twinId },
      context,
    };
    const dated = {
      ...original,
      context: { ...context, purchasedOn: "2026-10-18" },
    };
    expect(readPending(JSON.stringify(original), 2000)?.context).toEqual(
      context,
    );
    const restored = readPending(JSON.stringify(dated), 2000);
    expect(restored?.context).toEqual(dated.context);
    expect(restored?.input).toEqual(original.input);
    expect(restored?.status).toBe("uncertain");
    expect(contextIdentity(restored?.context)).toBe(context.twinId);
    expect(
      readPending(
        JSON.stringify({
          ...dated,
          context: { ...dated.context, purchasedOn: "2026-02-29" },
        }),
        2000,
      ),
    ).toBeNull();
  });
  it("distinguishes conflicting and unknown requests without echoing arbitrary errors", () => {
    expect(new CareHttpError(409, "careos_request_unknown").message).toContain(
      "no confirmed result",
    );
    expect(new CareHttpError(409, "careos_request_conflict").message).toContain(
      "conflicts",
    );
    expect(
      new CareHttpError(503, "secret-provider-text").message,
    ).not.toContain("secret-provider-text");
  });
});
