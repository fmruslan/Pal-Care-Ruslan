import { CareError, type CareAnswer } from "./contracts";
import { explanationSchema } from "./providers/responses";
import type { KnowledgeSource } from "./knowledge";

/**
 * Passages must already be exact-product scoped and integrity checked by the
 * caller. This is a source-scope disclosure, not a model care instruction.
 */
export function insufficientCareAnswer(
  base: CareAnswer,
  passages: KnowledgeSource[],
  reason: "insufficient" | "rejected" = "insufficient",
): CareAnswer {
  const twinId = base.context?.twinId;
  const guides =
    twinId &&
    base.outcome !== "unsupported" &&
    base.outcome !== "conflict" &&
    !passages.some((source) => source.status === "conflicting")
      ? passages.filter(
          (source) =>
            source.status === "approved" &&
            source.model === base.context?.model,
        )
      : [];
  const hasGuide = guides.length > 0;
  const text = hasGuide
    ? `The available documentation does not support an answer to that question. Available guide scope: ${guides.map((source) => `${source.title} · ${source.section}`).join("; ")}. Broader applicability is not established here. You can inspect the original guide.`
    : "No matching product-care guide is available in the supplied sources. I won’t invent instructions; review this purchase’s saved documents instead.";
  return {
    ...base,
    mode: "live",
    outcome: "missing",
    text:
      reason === "rejected"
        ? `The proposed model evidence could not be verified, so no instructions were used. ${text}`
        : text,
    steps: [],
    sources: guides.map((source) => ({
      id: source.id,
      title: source.title,
      label: `Guide metadata only · ${source.publisher} · ${source.license} · reviewed ${source.reviewedOn}`,
      href: `/vault/${twinId}/care#source-${source.id}`,
    })),
    actions: twinId
      ? [
          {
            label: hasGuide
              ? "Review product-care sources"
              : "Review saved documents",
            href: hasGuide
              ? `/vault/${twinId}/care`
              : `/vault/${twinId}#documents-heading`,
          },
        ]
      : [],
  };
}

export function groundedAnswer(
  base: CareAnswer,
  raw: unknown,
  passages: KnowledgeSource[],
): CareAnswer {
  const value = explanationSchema.parse(raw);
  if (value.outcome === "insufficient")
    return insufficientCareAnswer(base, passages);
  if (!value.steps.length) throw new CareError("careos_evidence_missing");
  const used = new Map<string, KnowledgeSource>();
  const excerpts = new Set<string>();
  for (const step of value.steps) {
    const source = passages.find(
      (s) => s.id === step.sourceId && s.status === "approved",
    );
    if (!source || !source.content.includes(step.quote))
      throw new CareError("careos_evidence_invalid");
    if (
      /https?:|javascript:|<\/?[a-z]|refund|paypal|warranty|recall|price drop|guarantee/i.test(
        step.text,
      )
    )
      throw new CareError("careos_answer_out_of_scope");
    used.set(source.id, source);
    // The model chooses evidence; the actual approved passage is rendered as the
    // instruction. Quote matching alone did not stop unsupported live paraphrases.
    const line = source.content
      .split("\n")
      .find((line) => line.includes(step.quote));
    const excerpt = line && line.length <= 1000 ? line : step.quote;
    if (
      /https?:|javascript:|<\/?[a-z]|refund|paypal|warranty|recall|price drop|guarantee|ignore.*instructions|system prompt|api.?key/i.test(
        excerpt,
      )
    )
      throw new CareError("careos_answer_out_of_scope");
    excerpts.add(excerpt);
  }
  const alternatives =
    [...excerpts].some((text) =>
      text.includes("To open the Shutdown Options window"),
    ) &&
    [...excerpts].some((text) =>
      text.includes("Double-press the power button"),
    );
  return {
    ...base,
    mode: "live",
    outcome: "answered",
    text: `${base.context!.name} · ${[...used.values()][0].section}. ${alternatives ? "These are alternative shutdown methods; choose one. " : ""}Follow the model and software conditions in the original guide.`,
    steps: [...excerpts],
    sources: [...used.values()].map((source) => ({
      id: source.id,
      title: source.title,
      label: `${source.publisher} · ${source.license} · reviewed ${source.reviewedOn} · AI adaptation`,
      href: `/vault/${base.context!.twinId}/care#source-${source.id}`,
      excerpt: source.content,
    })),
    actions: [
      {
        label: "Open product-care guide",
        href: `/vault/${base.context!.twinId}/care`,
      },
    ],
  };
}
