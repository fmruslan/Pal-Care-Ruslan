import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TestingAccess } from "../../src/components/careos/testing-access";
import {
  testingAccessRequest,
  testingAccessStatusSchema,
} from "../../src/lib/careos/testing-access-request";
import { privateHttpsOrigin } from "../../src/lib/private-preview-origin";

describe("testing access request is not authority", () => {
  it("prepares only a bounded non-secret proposal with all authorization boundaries", () => {
    const request = testingAccessRequest({
      hours: 4,
      scopes: ["studio", "customer"],
    });
    for (const phrase of [
      privateHttpsOrigin,
      "4 hours",
      "customer + studio",
      "proposal, not authorization",
      "exact UTC expiry",
      "unknowns before approval",
      "No new allowance",
      "No live model calls by the agent",
      "no",
      "never paste credentials",
    ]) {
      expect(request.toLowerCase()).toContain(phrase.toLowerCase());
    }
    expect(request).not.toContain("ssh ");
    expect(request).not.toContain("curl ");
    expect(request).not.toContain("pnpm ");
    expect(request).not.toMatch(/[a-f0-9]{64}/);
  });
  it("allows a shorter single-scope request without changing the requested scope", () => {
    const request = testingAccessRequest({ hours: 1, scopes: ["customer"] });
    expect(request).toContain("Requested duration: 1 hour from");
    expect(request).toContain("Requested scopes: customer (my browser only");
  });
  it("rejects unbounded durations, duplicate/privileged scopes and injected host/credential fields", () => {
    for (const input of [
      { hours: 24, scopes: ["customer"] },
      { hours: 4, scopes: [] },
      { hours: 4, scopes: ["customer", "customer"] },
      { hours: 4, scopes: ["operator"] },
      { hours: 4, scopes: ["customer"], token: "do-not-accept" },
      { hours: 4, scopes: ["customer"], origin: "https://evil.example" },
      { hours: "4", scopes: ["customer"] },
    ])
      expect(() => testingAccessRequest(input)).toThrow();
  });
  it("validates read-only status without accepting credentials or grant payloads", () => {
    const status = {
      window: "expired",
      expiresAt: "2026-10-29T22:10:58.310Z",
      scopes: { customer: false, studio: false },
    };
    expect(testingAccessStatusSchema.parse(status)).toEqual(status);
    expect(() =>
      testingAccessStatusSchema.parse({ ...status, token: "secret" }),
    ).toThrow();
    expect(() =>
      testingAccessStatusSchema.parse({ ...status, expiresAt: "invalid" }),
    ).toThrow();
  });
  it("renders an actionable expired state rather than token entry or automatic renewal", () => {
    const html = renderToStaticMarkup(
      createElement(TestingAccess, {
        initialAccess: {
          window: "expired",
          expiresAt: "2026-10-29T22:10:58.310Z",
          scopes: { customer: false, studio: false },
        },
      }),
    );
    expect(html).toContain("Testing session expired");
    expect(html).toContain("Prepare testing request");
    expect(html).toContain("your existing owner OpenCode conversation");
    expect(html).toContain("Counts");
    expect(html).not.toContain('type="password"');
    expect(html).not.toContain("Connect selected scopes via SSH");
    expect(html).not.toContain("Copy request for OpenCode"); // Only after explicit preparation.
  });
  it("does not describe active window alone as authenticated owner access", () => {
    const html = renderToStaticMarkup(
      createElement(TestingAccess, {
        initialAccess: {
          window: "active",
          expiresAt: null,
          scopes: { customer: false, studio: false },
        },
      }),
    );
    expect(html).toContain("browser permission still required");
    expect(html).not.toContain("Owner connected");
  });
});
