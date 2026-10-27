import { CareError, type CareAnswer } from "./contracts";
import { explanationSchema } from "./providers/responses";
import type { KnowledgeSource } from "./knowledge";

export function groundedAnswer(
  base: CareAnswer,
  raw: unknown,
  passages: KnowledgeSource[],
): CareAnswer {
  const value = explanationSchema.parse(raw);
  if (value.outcome === "insufficient")
    return {
      ...base,
      mode: "live",
      outcome: "missing",
      text: "The available documentation does not support an answer to that question. You can inspect the original guide.",
      steps: [],
      actions: [
        {
          label: "Review product-care sources",
          href: `/vault/${base.context!.twinId}/care`,
        },
      ],
    };
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
  return {
    ...base,
    mode: "live",
    outcome: "answered",
    text: `${base.context!.name} · ${[...used.values()][0].section}. Follow the model and software conditions in the original guide.`,
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
