import { z } from "zod";

export const caseStateSchema = z.enum([
  "awaiting_approval",
  "approved",
  "submitting",
  "unknown",
  "pending",
  "completed",
  "failed",
  "cancelled",
  "expired",
  "review",
]);
export type CaseState = z.infer<typeof caseStateSchema>;
export class GuardianError extends Error {
  constructor(
    public code: string,
    public status = 409,
  ) {
    super(code);
  }
}
export type GuardianCase = {
  id: string;
  twin_id: string;
  capture_id: string;
  policy_id: string;
  policy_hash: string;
  price_event_id: string;
  original_minor: number;
  compared_minor: number;
  amount_minor: number;
  revision: number;
  state: CaseState;
  reason: string;
  expires_at: Date;
  created_at: Date;
  updated_at: Date;
  lease_token: string | null;
  lease_until: Date | null;
};
export type GuardianView = {
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  approvalExpiresAt: string | null;
  attemptedAt: string | null;
  checkedAt: string | null;
  id: string;
  twinId: string;
  productName: string;
  state: CaseState;
  revision: number;
  originalMinor: number;
  comparedMinor: number;
  amountMinor: number;
  policyVersion: string;
  policyHash: string;
  policyTerms: string;
  priceOrigin: string;
  priceObservedAt: string;
  expiresAt: string;
  reason: string;
  refundId: string | null;
  providerStatus: string | null;
  verifiedAt: string | null;
  history: { id: string; kind: string; at: string; detail: string }[];
};
export type GuardianOverview = {
  cases: GuardianView[];
  monitoring: { lastCheck: string | null; scheduled: boolean };
  analytics: {
    opportunities: number;
    proposedMinor: number;
    approvedMinor: number;
    pendingMinor: number;
    unresolvedMinor: number;
    verifiedMinor: number;
    verifiedCount: number;
    failedCount: number;
  };
};
