import type { CareAnswer } from "./contracts";
import { evidenceSelectionSchema } from "./providers/responses";

// Model selects relevant evidence, never writes payment/recall status or amounts.
// Preserve the deterministic status/next actor even if a model omits them.
export function evidencePacket(base: CareAnswer) {
  const texts = [
    base.text,
    ...base.steps,
    ...(base.resolution ? Object.values(base.resolution) : []),
    ...base.sources.map((source) => source.label),
  ];
  return texts
    .slice(0, 10)
    .map((text, i) => ({ id: `fact-${i}`, text: text.slice(0, 1600) }));
}
export function evidencePayload(
  base: CareAnswer,
  question: string,
  history: unknown[],
) {
  const facts = evidencePacket(base),
    prior = [...history];
  const serialize = () =>
    JSON.stringify({
      question,
      context: base.context,
      facts,
      untrustedHistory: prior,
    });
  while (Buffer.byteLength(serialize(), "utf8") > 14000 && prior.length)
    prior.shift();
  while (Buffer.byteLength(serialize(), "utf8") > 14000 && facts.length > 1)
    facts.pop();
  if (Buffer.byteLength(serialize(), "utf8") > 14000)
    throw new Error("careos_context_too_large");
  return serialize();
}
export function selectedEvidence(base: CareAnswer, raw: unknown): CareAnswer {
  const value = evidenceSelectionSchema.parse(raw),
    facts = evidencePacket(base);
  if (
    new Set(value.factIds).size !== value.factIds.length ||
    value.factIds.some((id) => !facts.some((f) => f.id === id))
  )
    throw new Error("careos_evidence_selection_invalid");
  return {
    ...base,
    mode: "live",
    steps: value.factIds
      .filter((id) => id !== "fact-0")
      .map((id) => facts.find((f) => f.id === id)!.text),
  };
}
