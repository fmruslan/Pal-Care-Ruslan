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
  }
  return {
    ...base,
    mode: "live",
    outcome: "answered",
    text: `${base.context!.name} · ${[...used.values()][0].section}. Follow the model and software conditions in the original guide.`,
    steps: value.steps.map((step) => step.text),
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
