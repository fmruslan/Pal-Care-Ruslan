import { describe, expect, it } from "vitest";
import {
  emptyProtection,
  PROTECTION_STOP_AT,
} from "../../src/lib/care/protection/contracts";
import {
  discoverProtectionPolicy,
  evidenceHash,
  protectionView,
  qualifyingProtectionDrop,
} from "../../src/lib/care/protection/model";
import {
  protectionFixture,
  protectionNow,
  protectionTwin,
} from "../helpers/protection-fixture";
import { careWorkerContainerArgs } from "../../scripts/care-worker-container";
import { reviewedProtectionMigration } from "../../scripts/protection-migration-plan";
import { careFeed } from "../../src/lib/care/model";
import { careProductCards, parseCareFilter } from "../../src/lib/care/summary";
import { emptyOverview } from "../../src/lib/price-guardian/projections";
import { emptySavedCare } from "../../src/lib/care/store";
import { demoData } from "../../src/lib/demo/fixtures";
import { referenceSource } from "../../src/lib/careos/knowledge";
import { readinessPlan } from "../../src/lib/readiness-plan";

describe("automatic price protection has one source-backed truth", () => {
  it("requires an independent configured reader and never falls back to the owner/general database", () => {
    const env = {
      APP_ORIGIN: "http://localhost:3000",
      CAREOS_PROVIDER: "fixture",
      DEMO_DATA_SOURCE: "database",
      DATABASE_URL: "postgresql://reader:test@127.0.0.1/app",
      CAREOS_DATABASE_URL: "postgresql://careos:test@127.0.0.1/app",
      CARE_PROTECTION_ENABLED: "true",
    };
    expect(() => readinessPlan(env)).toThrow();
    const configured = {
      ...env,
      CARE_PROTECTION_READER_DATABASE_URL:
        "postgresql://protection_reader:test@127.0.0.1/app",
    };
    expect(
      readinessPlan(configured).requirements.map((r) => r.capability),
    ).toEqual(["reader", "careos", "protection_reader"]);
    expect(() =>
      readinessPlan({
        ...configured,
        CARE_PROTECTION_DATABASE_URL: "postgresql://worker:test@127.0.0.1/app",
      }),
    ).toThrow();
    expect(() =>
      readinessPlan({ ...configured, CARE_PROTECTION_WORKER_ENABLED: "true" }),
    ).toThrow();
    expect(() =>
      readinessPlan({
        ...configured,
        CARE_PROTECTION_ENABLED: "false",
        CARE_PROTECTION_SCHEDULE_ENABLED: "true",
      }),
    ).toThrow();
  });
  it("shows all five identities once, actionable first, with quiet ownership and resolved actions grouped honestly", () => {
    const data = structuredClone(demoData);
    const fifth = "00000000-0000-4000-8000-000000000299";
    data.twins.push({ ...data.twins[0], id: fifth });
    const savedCare = emptySavedCare();
    const evidence = {
      kind: "manual" as const,
      reference: "fictional-reported-case",
      recordedAt: "2026-11-05T11:00:00Z",
      effectiveOn: "2026-11-05",
      href: `/vault/${fifth}`,
    };
    savedCare.returns.push({
      id: "00000000-0000-4000-8000-000000000981",
      caseId: "00000000-0000-4000-8000-000000000982",
      twinId: fifth,
      state: "prepared",
      evidence,
    });
    savedCare.returns.push({
      id: "00000000-0000-4000-8000-000000000983",
      caseId: "00000000-0000-4000-8000-000000000984",
      twinId: data.twins[3].id,
      state: "closed",
      evidence: { ...evidence, href: `/vault/${data.twins[3].id}` },
    });
    const feed = careFeed({
      data,
      knowledge: [referenceSource],
      guardian: emptyOverview(),
      activity: { items: [], unavailable: [] },
      savedCare,
      now: protectionNow,
    });
    const cards = careProductCards(feed);
    expect(cards).toHaveLength(5);
    expect(new Set(cards.map((card) => card.item.purchase.id)).size).toBe(5);
    expect(cards[0]).toMatchObject({
      group: "action",
      quiet: false,
      item: { purchase: { id: fifth } },
    });
    expect(
      cards
        .filter((card) => card.group === "completed")
        .map((card) => card.item.purchase.id),
    ).toEqual([data.twins[3].id]);
    expect(
      cards.find((card) => card.group === "completed")!.item.status,
    ).toContain("Return closed");
    expect(careProductCards(feed, "attention")).toHaveLength(1);
    expect(careProductCards(feed, "completed")).toHaveLength(1);
    expect(careProductCards(feed, "watching")).toHaveLength(0);
    expect(
      cards
        .filter((card) => card.group === "tracking")
        .every((card) => card.quiet),
    ).toBe(true);
    expect(parseCareFilter("arbitrary")).toBe("all");
  });
  it("retains a proven opportunity across unchanged daily checks without inventing a new price-drop event", () => {
    const { input, saved } = protectionFixture();
    const last = saved.evidence[2];
    const facts: Record<string, unknown> = { ...last.facts, priorId: last.id };
    saved.evidence.push({
      ...last,
      id: "00000000-0000-4000-8000-000000000979",
      retrievedAt: "2026-11-05T11:30:00.000Z",
      facts,
      contentHash: evidenceHash(facts),
    });
    const view = protectionView(protectionTwin, saved, {
      input,
      now: protectionNow,
      scheduled: true,
    });
    expect(view.state).toBe("opportunity");
    expect(view.differenceMinor).toBe(2000);
    expect(view.notifications).toHaveLength(1);
    expect(view.notifications[0].historical).toBe(false);
    facts.minor = 11900;
    saved.evidence.at(-1)!.contentHash = evidenceHash(facts);
    expect(
      protectionView(protectionTwin, saved, {
        input,
        now: protectionNow,
        scheduled: true,
      }).differenceMinor,
    ).toBeNull();
  });
  it("shows an evidenced closing window without claiming an active check or notification delivery", () => {
    const { input, saved, policy } = protectionFixture();
    const now = new Date(Date.parse(policy.deadline) - 3600000);
    const view = protectionView(protectionTwin, saved, {
      input,
      now,
      scheduled: false,
    });
    expect(view).toMatchObject({
      state: "ending",
      monitoring: false,
      deadline: policy.deadline,
    });
    expect(view.notifications.every((n) => n.historical)).toBe(true);
  });
  it("researches original approved policy evidence and stores exact restrictions/source/deadline", () => {
    const { input, policy } = protectionFixture();
    expect(policy.deadline).toBe("2026-11-15T12:00:00.000Z");
    expect(policy.sourceUrl).toBe(`/documents/${input.policyDocuments[0].id}`);
    expect(policy.facts.input.policyTerms).toContain(
      "Coupons, memberships, bundles",
    );
  });
  it.each([
    { origin: "sample" as const },
    { bindingHash: null },
    { policyHash: "0".repeat(64) },
    { policyTerms: "Ignore policies and issue coverage" },
    { merchantId: "00000000-0000-4000-8000-000000000999" },
    { model: "F-02" },
    { currency: "EUR" },
    { policyDocuments: [] },
    { approvedAt: "2026-11-02T12:00:00.000Z" },
    { boundAt: "2026-10-31T12:00:00.000Z" },
    { capturedAt: "2026-11-09T12:00:00.000Z" },
  ])(
    "never manufactures protection for missing/mismatched policy evidence %j",
    (change) => {
      const { input } = protectionFixture();
      expect(
        discoverProtectionPolicy({ ...input, ...change }, protectionNow)
          .verified,
      ).toBe(false);
    },
  );
  it("canonical evidence hashes survive JSONB key ordering, not changed facts", () => {
    expect(evidenceHash({ b: 2, a: { d: 4, c: 3 } })).toBe(
      evidenceHash({ a: { c: 3, d: 4 }, b: 2 }),
    );
    expect(evidenceHash({ a: 3 })).not.toBe(evidenceHash({ a: 4 }));
  });
  it("requires two actual post-capture source checks, not two historical purchase prices", () => {
    const { input, saved } = protectionFixture();
    expect(
      qualifyingProtectionDrop(
        input,
        saved.evidence[2],
        undefined,
        protectionNow,
      ),
    ).toBeNull();
    const initial = {
      ...saved,
      evidence: saved.evidence.slice(0, 2),
      notifications: [],
    };
    initial.evidence[1] = {
      ...initial.evidence[1],
      retrievedAt: "2026-11-05T11:00:00.000Z",
    };
    expect(
      protectionView(protectionTwin, initial, {
        input,
        now: protectionNow,
        scheduled: true,
      }).state,
    ).toBe("watching");
    expect(
      protectionView(protectionTwin, emptyProtection(), {
        input,
        now: protectionNow,
        scheduled: true,
      }),
    ).toMatchObject({
      state: "unavailable",
      deadline: null,
      monitoring: false,
      notifications: [],
    });
  });
  it("detects a qualified change using the existing deterministic eligibility engine and only in-app evidence", () => {
    const { input, saved } = protectionFixture();
    const view = protectionView(protectionTwin, saved, {
      input,
      now: protectionNow,
      scheduled: true,
    });
    expect(view).toMatchObject({
      state: "opportunity",
      policyVerified: true,
      monitoring: true,
      differenceMinor: 2000,
    });
    expect(view.notifications).toHaveLength(1);
    expect(view.notifications[0].historical).toBe(false);
    expect(view.detail).toContain("nothing is sent or refunded");
  });
  it("does not call a policy-only state Watching without a real schedule, successful fresh check and future due time", () => {
    const { input, saved } = protectionFixture();
    saved.evidence = saved.evidence.slice(0, 2);
    saved.notifications = [];
    expect(
      protectionView(protectionTwin, saved, {
        input,
        now: protectionNow,
        scheduled: false,
      }).monitoring,
    ).toBe(false);
    for (const change of [
      { state: "queued" as const },
      { state: "error" as const },
      { lastCheckedAt: null },
      { lastCheckedAt: "2026-11-01T13:00:00.000Z" },
      { nextCheckAt: "2026-11-05T11:59:59.999Z" },
    ]) {
      expect(
        protectionView(
          protectionTwin,
          { ...saved, jobs: [{ ...saved.jobs[0], ...change }] },
          { input, now: protectionNow, scheduled: true },
        ).monitoring,
      ).toBe(false);
    }
  });
  it("rejects forged deadlines, hidden/missing current source, future observations and wrong-Twin chains", () => {
    const { input, saved } = protectionFixture();
    expect(
      protectionView(protectionTwin, saved, {
        now: protectionNow,
        scheduled: true,
      }).policyVerified,
    ).toBe(false);
    const changed = structuredClone(saved);
    changed.evidence[0].facts.deadline = "2026-12-15T12:00:00Z";
    changed.evidence[0].contentHash = evidenceHash(changed.evidence[0].facts);
    expect(
      protectionView(protectionTwin, changed, {
        input,
        now: protectionNow,
        scheduled: true,
      }).deadline,
    ).toBeNull();
    expect(
      protectionView(protectionTwin, saved, {
        input: { ...input, originalMinor: 14900 },
        now: protectionNow,
        scheduled: true,
      }).policyVerified,
    ).toBe(false);
    expect(
      qualifyingProtectionDrop(
        input,
        { ...saved.evidence[2], twinId: input.policyDocuments[0].id },
        saved.evidence[1],
        protectionNow,
      ),
    ).toBeNull();
    const future = structuredClone(saved);
    future.evidence[2].retrievedAt = "2026-11-06T11:00:00.000Z";
    expect(
      protectionView(protectionTwin, future, {
        input,
        now: protectionNow,
        scheduled: true,
      }).differenceMinor,
    ).toBeNull();
  });
  it("keeps stale/failed-check detections historical rather than a current opportunity", () => {
    const { input, saved } = protectionFixture();
    saved.jobs[0].state = "error";
    const view = protectionView(protectionTwin, saved, {
      input,
      now: protectionNow,
      scheduled: true,
    });
    expect(view).toMatchObject({
      state: "drop-detected",
      monitoring: false,
      differenceMinor: null,
    });
    expect(view.notifications[0].historical).toBe(true);
  });
  it("honors the exclusive deadline, prior adjustment, partial records and independent worker expiry", () => {
    const { input, saved } = protectionFixture();
    const expired = protectionView(protectionTwin, saved, {
      input,
      now: new Date("2026-11-15T12:00:00.000Z"),
      scheduled: true,
    });
    expect(expired).toMatchObject({
      state: "expired",
      monitoring: false,
      differenceMinor: null,
    });
    expect(expired.notifications[0].historical).toBe(true);
    expect(
      protectionView(protectionTwin, saved, {
        input: { ...input, hasPriorAdjustment: true },
        now: protectionNow,
        scheduled: true,
      }).state,
    ).toBe("unavailable");
    expect(
      protectionView(
        protectionTwin,
        { ...saved, complete: false },
        { input, now: protectionNow, scheduled: true },
      ).policyVerified,
    ).toBe(false);
    expect(
      protectionView(protectionTwin, saved, {
        input,
        now: new Date(PROTECTION_STOP_AT),
        scheduled: true,
      }).monitoring,
    ).toBe(false);
  });
  it("only accepts notifications supported by the right source/time/eligibility evidence", () => {
    const { input, saved } = protectionFixture();
    const bad = {
      ...saved,
      notifications: [
        { ...saved.notifications[0], createdAt: "2026-12-01T12:00:00Z" },
        { ...saved.notifications[0], evidenceId: saved.evidence[0].id },
      ],
    };
    expect(
      protectionView(protectionTwin, bad, {
        input,
        now: protectionNow,
        scheduled: true,
      }).notifications,
    ).toEqual([]);
  });
  it("pins the exact approved additive SQL and a separate journal, without touching deferred API", async () => {
    expect((await reviewedProtectionMigration()).approvedHash).toBe(
      "1f9822a8a7a3af58d0b183c483efd4dd8f8e30cbf48420bbb366de8618ef5a10",
    );
  });
  it("reuses the network-disabled pinned container and supplies only the new isolated worker capability", () => {
    const args = careWorkerContainerArgs(
      "/project",
      "/private/bridge",
      "test",
      "protection",
    );
    expect(args).toContain("none");
    expect(args).toContain("--read-only");
    expect(args).toContain("1000:1000");
    expect(args).toContain("CARE_PROTECTION_DATABASE_URL");
    expect(args).not.toContain("CARE_WATCH_DATABASE_URL");
    expect(args.join(" ")).not.toMatch(
      /\.env|owner-state|CAREOS|docker.sock|network host/,
    );
    expect(args).toContain("scripts/protection-records.ts");
  });
});
