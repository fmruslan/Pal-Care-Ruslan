import { describe, expect, it } from "vitest";
import {
  CareHttpError,
  contextIdentity,
  readPending,
} from "@/components/careos/conversation-client";

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
