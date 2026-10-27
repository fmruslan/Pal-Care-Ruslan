import { z } from "zod";
import { matchRecall } from "./matching";
import { REVIEWED_SOURCE_HASH, reviewedModels } from "./reference";
export const recallEvidenceSchema = z.strictObject({
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  title: z.string().min(1).max(1000),
  url: z
    .string()
    .max(1000)
    .refine((v) => {
      try {
        const u = new URL(v);
        return (
          u.protocol === "https:" &&
          u.hostname === "www.cpsc.gov" &&
          u.pathname.startsWith("/Recalls/") &&
          !u.username &&
          !u.password &&
          !u.port
        );
      } catch {
        return false;
      }
    }),
  retrievedAt: z.iso.datetime(),
  mode: z.enum(["bundled_official_snapshot", "retrieved_official_snapshot"]),
  unavailable: z.boolean(),
});
export type RecallEvidence = z.infer<typeof recallEvidenceSchema>;
export function recallExplanation(
  product: { brand: string; model: string },
  evidence?: RecallEvidence,
) {
  const p = recallEvidenceSchema.safeParse(evidence);
  if (!p.success)
    return {
      text: `For ${product.brand} ${product.model}, no validated official recall evidence was loaded. No live recall check or safety certification was performed.`,
      evidence: null,
    };
  const e = p.data,
    decision = matchRecall(
      { ...product, identifiersVerified: false },
      {
        brand: "Insignia",
        models: reviewedModels,
        restrictionsReviewed: true,
        requiresSerial: false,
        requiresDate: false,
        sourceUnchanged: e.hash === REVIEWED_SOURCE_HASH,
      },
    );
  return {
    text: `For ${product.brand} ${product.model}: ${decision.reason} Scope is one reviewed CPSC notice, not the complete recall database. This does not confirm this product’s current recall status. ${e.mode === "bundled_official_snapshot" ? "Bundled historical official snapshot; no live source check this turn." : "Saved official retrieval; no live source check this turn."} ${e.unavailable ? "The latest refresh failed; current status is not established." : `Source retrieved ${e.retrievedAt}.`} No physical product identity or remedy eligibility is established.`,
    evidence: e,
  };
}
