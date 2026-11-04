import { z } from "zod";

// These are application-validated facts, never model output or browser authority.
export const careEvidenceSchema = z.strictObject({
  kind: z.enum(["sample", "manual", "external"]),
  reference: z.string().min(1).max(200),
  recordedAt: z.iso.datetime({ offset: true }),
  effectiveOn: z.iso.date(),
  href: z
    .string()
    .regex(/^\/(documents|vault|guardian)\/[a-f0-9-]{36}(?:#[-a-z]+)?$/),
});
export type CareEvidence = z.infer<typeof careEvidenceSchema>;
export const returnMilestoneSchema = z.strictObject({
  id: z.uuid(),
  twinId: z.uuid(),
  caseId: z.uuid(),
  state: z.enum([
    "prepared",
    "requested",
    "accepted",
    "shipped",
    "received",
    "closed",
    "rejected",
    "cancelled",
  ]),
  evidence: careEvidenceSchema,
});
export type ReturnMilestone = z.infer<typeof returnMilestoneSchema>;
export const warrantySchema = z.strictObject({
  twinId: z.uuid(),
  evidence: careEvidenceSchema,
  expiresOn: z.iso.date(),
  basis: z.string().min(1).max(500),
});
export type WarrantyRecord = z.infer<typeof warrantySchema>;

export function evidenceLabel(evidence: CareEvidence) {
  return evidence.kind === "manual"
    ? "Reported by you"
    : evidence.kind === "sample"
      ? "Fictional demonstration"
      : "Source-backed record";
}

/** Never fill skipped milestones, or turn a return into payment evidence. */
export function returnTimeline(twinId: string, input: unknown[]) {
  const rows = input.flatMap((value) => {
    const result = returnMilestoneSchema.safeParse(value);
    return result.success && result.data.twinId === twinId ? [result.data] : [];
  });
  const conflicts = new Set(
    rows
      .filter((row) =>
        rows.some(
          (other) =>
            other.id === row.id &&
            JSON.stringify(other) !== JSON.stringify(row),
        ),
      )
      .map((row) => row.id),
  );
  return [
    ...new Map(
      rows.filter((row) => !conflicts.has(row.id)).map((row) => [row.id, row]),
    ).values(),
  ].sort(
    (a, b) =>
      a.evidence.effectiveOn.localeCompare(b.evidence.effectiveOn) ||
      a.evidence.recordedAt.localeCompare(b.evidence.recordedAt) ||
      a.id.localeCompare(b.id),
  );
}

/** Calendar dates are compared in UTC; no implicit duration/coverage inference. */
export function warrantyDeadline(value: unknown, referenceDate: string) {
  const result = warrantySchema.safeParse(value);
  if (!result.success || !z.iso.date().safeParse(referenceDate).success)
    return null;
  const record = result.data;
  const days = Math.round(
    (Date.parse(record.expiresOn) - Date.parse(referenceDate)) / 86400000,
  );
  return {
    ...record,
    days,
    approaching: days >= 0 && days <= 30,
    expired: days < 0,
  };
}
