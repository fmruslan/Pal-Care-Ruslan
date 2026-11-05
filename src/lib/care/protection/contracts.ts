import { z } from "zod";

export const PROTECTION_STOP_AT = "2026-12-04T20:18:12.252Z";
export const protectionStates = [
  "policy-checking",
  "verified",
  "watching",
  "drop-detected",
  "opportunity",
  "ending",
  "requested",
  "confirmed",
  "unavailable",
  "expired",
] as const;
export type ProtectionState = (typeof protectionStates)[number];
export const protectionLabels: Record<ProtectionState, string> = {
  "policy-checking": "Policy being checked",
  verified: "Protection verified",
  watching: "Watching for price drops",
  "drop-detected": "Price drop detected",
  opportunity: "Possible adjustment available",
  ending: "Adjustment window ending soon",
  requested: "Adjustment requested",
  confirmed: "Adjustment confirmed",
  unavailable: "Protection not verified",
  expired: "Adjustment window expired",
};
export type ProtectionView = {
  twinId: string;
  state: ProtectionState;
  label: string;
  detail: string;
  deadline: string | null;
  lastCheckedAt: string | null;
  nextCheckAt: string | null;
  policyVerified: boolean;
  monitoring: boolean;
  differenceMinor: number | null;
  sources: { label: string; href: string }[];
  notifications: {
    id: string;
    kind: "opportunity" | "window-ending";
    at: string;
    historical: boolean;
  }[];
};
const iso = z.iso.datetime({ offset: true });
export const protectionJobSchema = z.object({
  twinId: z.uuid(),
  state: z.enum(["queued", "supported", "unavailable", "expired", "error"]),
  createdAt: iso,
  nextCheckAt: iso,
  lastCheckedAt: iso.nullable(),
  checks: z.int().nonnegative(),
});
export const protectionEvidenceSchema = z.object({
  id: z.uuid(),
  twinId: z.uuid(),
  kind: z.enum(["policy", "catalog", "unavailable"]),
  source: z.enum(["purchase-policy", "forma-catalog", "unavailable"]),
  sourceUrl: z
    .string()
    .regex(/^\/(documents\/[a-f0-9-]{36}|care\/[a-f0-9-]{36}#price|shop)$/),
  retrievedAt: iso,
  facts: z.record(z.string(), z.unknown()),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
});
export const protectionNotificationSchema = z.object({
  id: z.uuid(),
  twinId: z.uuid(),
  evidenceId: z.uuid(),
  kind: z.enum(["opportunity", "window-ending"]),
  createdAt: iso,
});
export type ProtectionJob = z.infer<typeof protectionJobSchema>;
export type ProtectionEvidence = z.infer<typeof protectionEvidenceSchema>;
export type ProtectionNotification = z.infer<
  typeof protectionNotificationSchema
>;
export type SavedProtection = {
  jobs: ProtectionJob[];
  evidence: ProtectionEvidence[];
  notifications: ProtectionNotification[];
  complete: boolean;
};
export const emptyProtection = (): SavedProtection => ({
  jobs: [],
  evidence: [],
  notifications: [],
  complete: true,
});
