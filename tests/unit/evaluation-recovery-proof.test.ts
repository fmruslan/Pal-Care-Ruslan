import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import {
  OWNER_ORIGIN,
  StandingOwner,
} from "../../src/lib/careos/standing-owner";
import {
  standingProof,
  assertStandingOwner,
} from "../../src/lib/careos/standing-runtime";

const context = vi.hoisted(() => ({
  headers: new Headers(),
  cookies: new Map<string, string>(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: async () => context.headers,
  cookies: async () => ({
    get: (name: string) =>
      context.cookies.has(name)
        ? { name, value: context.cookies.get(name)! }
        : undefined,
  }),
}));
const ai = "a".repeat(64),
  records = "b".repeat(64),
  review = "c".repeat(64);
const sha = (value: string) => createHash("sha256").update(value).digest("hex");
beforeEach(() => {
  vi.stubEnv("APP_ORIGIN", OWNER_ORIGIN);
  vi.stubEnv("PALCARE_NORTH_REVIEW_PREVIEW", "false");
  context.headers = new Headers({
    host: new URL(OWNER_ORIGIN).host,
    origin: OWNER_ORIGIN,
    "sec-fetch-site": "same-origin",
    "user-agent": "test-original-agent",
  });
  context.cookies = new Map([
    ["__Host-palcare-owner", ai],
    ["palcare-records", records],
    ["palcare-north-review-records", review],
  ]);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("actual standingProof server boundary (headers/cookies doubles only; no owner files or live calls)", () => {
  it("derives the exact fixed primary records namespace independently of the AI cookie", async () => {
    expect(await standingProof()).toEqual({
      token: ai,
      agent: "test-original-agent",
      origin: OWNER_ORIGIN,
      recordsOwnerDigest: sha(`records-v1:${records}`),
      channel: undefined,
    });
    context.cookies.set("__Host-palcare-owner", "revoked-or-malformed-cookie");
    expect(await standingProof("records")).toMatchObject({
      token: "revoked-or-malformed-cookie",
      recordsOwnerDigest: sha(`records-v1:${records}`),
      channel: "records",
    });
    expect((await standingProof("records")).recordsOwnerDigest).not.toBe(
      sha(`records-v1:${ai}`),
    );
    // Extracting the old cookie does not approve or identify any AI principal.
  });
  it("ignores posted/header ownership, scopes, agent hashes and channel flags", async () => {
    context.headers.set("x-palcare-records-owner", sha("attacker"));
    context.headers.set("x-palcare-channel", "records");
    context.headers.set(
      "x-palcare-session-id",
      "0dc8c2d0-c3c6-4f94-8e05-679c6d7fdbe1",
    );
    context.headers.set("x-palcare-agent-hash", sha("forged"));
    context.headers.set("x-palcare-scope", "customer-studio");
    const actual = await standingProof();
    expect(actual.channel).toBeUndefined();
    expect(actual.recordsOwnerDigest).toBe(sha(`records-v1:${records}`));
    expect(actual.agent).toBe("test-original-agent");
    expect(Object.keys(actual).sort()).toEqual(
      ["token", "agent", "origin", "recordsOwnerDigest", "channel"].sort(),
    );
  });
  it.each([undefined, "", "bad", "A".repeat(64), "f".repeat(63)])(
    "does not accept invalid/missing primary records capability %s or fall back to the review cookie",
    async (value) => {
      context.cookies.delete("palcare-records");
      if (value !== undefined) context.cookies.set("palcare-records", value);
      expect(
        (await standingProof("records")).recordsOwnerDigest,
      ).toBeUndefined();
    },
  );
  it.each(["host", "origin", "cross-site", "forwarded-host"])(
    "rejects wrong %s before collecting a proof",
    async (kind) => {
      if (kind === "host") context.headers.set("host", "attacker.invalid");
      if (kind === "origin")
        context.headers.set("origin", "https://attacker.invalid");
      if (kind === "cross-site")
        context.headers.set("sec-fetch-site", "cross-site");
      if (kind === "forwarded-host") {
        context.headers.set("host", "127.0.0.1:3002");
        context.headers.set("x-forwarded-host", new URL(OWNER_ORIGIN).host);
        context.headers.set("x-forwarded-proto", "https");
      }
      await expect(standingProof("records")).rejects.toThrow("origin_rejected");
    },
  );
  it("allows an absent Origin for same-host read-only proof without inventing a records channel", async () => {
    context.headers.delete("origin");
    expect(await standingProof()).toMatchObject({
      origin: OWNER_ORIGIN,
      channel: undefined,
    });
  });
  it("passes only the explicit server-selected channel/scope to central authentication", async () => {
    const authenticate = vi
      .spyOn(StandingOwner.prototype, "authenticate")
      .mockResolvedValue("unit-only-principal");
    const proof = await assertStandingOwner("records", "customer");
    expect(authenticate).toHaveBeenCalledTimes(1);
    expect(authenticate).toHaveBeenCalledWith(proof, "customer");
    expect(proof.channel).toBe("records");
    authenticate.mockClear();
    await assertStandingOwner();
    expect(authenticate.mock.calls[0][0].channel).toBeUndefined();
  });
});
