// Explicitly injected domain evidence for isolated tests, never application seed.
import {
  guardianPolicyHash,
  guardianRules,
  guardianTerms,
  GUARDIAN_PRODUCT,
  MERCHANT_ID,
} from "../../src/lib/price-guardian/policy";
import {
  discoverProtectionPolicy,
  evidenceHash,
  type ProtectionInput,
} from "../../src/lib/care/protection/model";
import type { SavedProtection } from "../../src/lib/care/protection/contracts";
export const protectionTwin = "00000000-0000-4000-8000-000000000201";
export const protectionNow = new Date("2026-11-05T12:00:00.000Z");
export function protectionFixture() {
  const input: ProtectionInput = {
    twinId: protectionTwin,
    merchantId: MERCHANT_ID,
    productId: GUARDIAN_PRODUCT,
    origin: "sandbox",
    originalMinor: 12900,
    currency: "USD",
    brand: "Forma",
    model: "F-01",
    verifiedAt: "2026-11-01T12:00:00.000Z",
    capturedAt: "2026-11-01T12:00:00.000Z",
    orderCreatedAt: "2026-11-01T11:55:00.000Z",
    boundAt: "2026-11-01T11:56:00.000Z",
    approvedAt: "2026-10-31T12:00:00.000Z",
    bindingHash: guardianPolicyHash,
    policyHash: guardianPolicyHash,
    policyVersion: guardianRules.version,
    policyRules: guardianRules,
    policyTerms: guardianTerms,
    policyDocuments: [
      { id: "00000000-0000-4000-8000-000000000301", content: guardianTerms },
    ],
    catalogBrand: "Forma",
    catalogModel: "F-01",
    catalogMinor: 10900,
    catalogCurrency: "USD",
    hasPriorAdjustment: false,
  };
  const policy = discoverProtectionPolicy(input, protectionNow);
  if (!policy.verified) throw Error("bad_test_policy");
  const priorId = "00000000-0000-4000-8000-000000000971",
    currentId = "00000000-0000-4000-8000-000000000972",
    policyId = "00000000-0000-4000-8000-000000000970";
  const policyFacts = policy.facts;
  const priorFacts = {
    version: "protection-catalog-v1",
    merchantId: MERCHANT_ID,
    productId: GUARDIAN_PRODUCT,
    brand: "Forma",
    model: "F-01",
    currency: "USD",
    minor: 12900,
    priorId: null,
  };
  const currentFacts = { ...priorFacts, minor: 10900, priorId };
  const saved: SavedProtection = {
    complete: true,
    jobs: [
      {
        twinId: protectionTwin,
        state: "supported",
        createdAt: "2026-11-02T12:00:00.000Z",
        lastCheckedAt: "2026-11-05T11:00:00.000Z",
        nextCheckAt: "2026-11-06T11:00:00.000Z",
        checks: 2,
      },
    ],
    evidence: [
      {
        id: policyId,
        twinId: protectionTwin,
        kind: "policy",
        source: "purchase-policy",
        sourceUrl: policy.sourceUrl,
        retrievedAt: "2026-11-02T12:00:00.000Z",
        facts: policyFacts,
        contentHash: evidenceHash(policyFacts),
      },
      {
        id: priorId,
        twinId: protectionTwin,
        kind: "catalog",
        source: "forma-catalog",
        sourceUrl: "/shop",
        retrievedAt: "2026-11-02T12:00:00.000Z",
        facts: priorFacts,
        contentHash: evidenceHash(priorFacts),
      },
      {
        id: currentId,
        twinId: protectionTwin,
        kind: "catalog",
        source: "forma-catalog",
        sourceUrl: "/shop",
        retrievedAt: "2026-11-05T11:00:00.000Z",
        facts: currentFacts,
        contentHash: evidenceHash(currentFacts),
      },
    ],
    notifications: [
      {
        id: "00000000-0000-4000-8000-000000000973",
        twinId: protectionTwin,
        evidenceId: currentId,
        kind: "opportunity",
        createdAt: "2026-11-05T11:00:00.000Z",
      },
    ],
  };
  return { input, saved, policy };
}
