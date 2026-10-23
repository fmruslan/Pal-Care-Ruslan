import { z } from "zod";
import type { GuardianOverview } from "../price-guardian/contracts";
export const stages = [
  "Proposed",
  "Approved",
  "Pending",
  "Unresolved",
  "Verified",
  "Closed",
] as const;
export const factSchema = z.strictObject({
  id: z.string().min(1).max(80),
  product: z.string().min(1).max(120),
  stage: z.enum(stages),
  amountMinor: z.int().min(0).max(2000),
  originalMinor: z.int().min(0).max(20000),
  comparedMinor: z.int().min(0).max(20000),
  policy: z.string().max(80),
  evidence: z.enum([
    "Recorded opportunity",
    "Retrieved pending",
    "Independent verification",
    "Needs review",
    "Illustrative scenario",
  ]),
  checkedAt: z.string().max(40),
  href: z
    .string()
    .regex(/^\/guardian\/[a-f0-9-]{36}$/)
    .nullable(),
});
export type IntelligenceFact = z.infer<typeof factSchema>;
export type IntelligenceDataset = {
  mode: "recorded" | "illustrative";
  facts: IntelligenceFact[];
  lastCheck: string | null;
  totalCases: number;
  allVerifiedMinor: number;
};
export function recordedDataset(
  overview: GuardianOverview,
): IntelligenceDataset {
  return {
    mode: "recorded",
    lastCheck: overview.monitoring.lastCheck,
    totalCases: overview.analytics.opportunities,
    allVerifiedMinor: overview.analytics.verifiedMinor,
    facts: overview.cases.map((c) => {
      const verified =
        c.state === "completed" &&
        c.providerStatus === "COMPLETED" &&
        !!c.verifiedAt &&
        !!c.refundId;
      const stage = verified
        ? "Verified"
        : c.state === "awaiting_approval"
          ? "Proposed"
          : c.state === "approved"
            ? "Approved"
            : c.state === "pending" && c.providerStatus === "PENDING"
              ? "Pending"
              : ["failed", "cancelled", "expired"].includes(c.state)
                ? "Closed"
                : "Unresolved";
      return factSchema.parse({
        id: c.id,
        product: c.productName,
        stage,
        amountMinor: c.amountMinor,
        originalMinor: c.originalMinor,
        comparedMinor: c.comparedMinor,
        policy: c.policyVersion,
        evidence: verified
          ? "Independent verification"
          : stage === "Pending"
            ? "Retrieved pending"
            : stage === "Unresolved"
              ? "Needs review"
              : "Recorded opportunity",
        checkedAt: c.checkedAt ?? c.updatedAt,
        href: `/guardian/${c.id}`,
      });
    }),
  };
}
export const illustrativeDataset: IntelligenceDataset = {
  mode: "illustrative",
  lastCheck: null,
  totalCases: 6,
  allVerifiedMinor: 0,
  facts: stages.map((stage, i) =>
    factSchema.parse({
      id: `example-${i}`,
      product: i % 2 ? "Forma F-01 · example B" : "Forma F-01 · example A",
      stage,
      amountMinor: 2000,
      originalMinor: 12900,
      comparedMinor: 10900,
      policy: "demo-price-v2 example",
      evidence: "Illustrative scenario",
      checkedAt: "Not provider checked",
      href: null,
    }),
  ),
};
export function totals(facts: IntelligenceFact[]) {
  const result = Object.fromEntries(
    stages.map((stage) => [stage, 0]),
  ) as Record<(typeof stages)[number], number>;
  for (const fact of facts) result[fact.stage] += fact.amountMinor;
  return result;
}
export function filterFacts(facts: IntelligenceFact[], stage: string) {
  return stage === "All" ? facts : facts.filter((f) => f.stage === stage);
}
