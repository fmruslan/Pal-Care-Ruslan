import type { DemoData } from "../../db/schema";
import { findTwin } from "../demo/presentation";
import {
  CareError,
  type CareAnswer,
  type CareTurn,
  type TurnInput,
} from "./contracts";
import { retrievePassages, type KnowledgeSource } from "./knowledge";
import {
  deterministicAnswer,
  interpret,
  isProhibited,
  purchaseSelection,
} from "./tools";
import { fixtureCare } from "./providers/fixture";
import { groundedAnswer } from "./grounding";
import type { CareModel, ModelResult } from "./providers/responses";
import type { GuardianView } from "../price-guardian/contracts";
import type { RecallEvidence } from "../safety/evidence";
import { referenceContext } from "./journey";
import type { PurchaseActivity } from "./activity";
import { evidencePayload, selectedEvidence } from "./evidence-selection";

function modelPayload(
  task: "classify" | "care",
  question: string,
  product: { brand: string; model: string } | null,
  past: { question: string; answer: string }[],
  sources: KnowledgeSource[] = [],
) {
  const history = [...past],
    passages = [...sources];
  const serialize = () =>
    JSON.stringify({
      task,
      question,
      product,
      history,
      untrustedPassages: passages.map((s) => ({
        id: s.id,
        title: s.title,
        section: s.section,
        content: s.content,
      })),
    });
  let payload = serialize();
  while (Buffer.byteLength(payload, "utf8") > 14000 && history.length) {
    history.shift();
    payload = serialize();
  }
  while (Buffer.byteLength(payload, "utf8") > 14000 && passages.length > 1) {
    passages.pop();
    payload = serialize();
  }
  if (Buffer.byteLength(payload, "utf8") > 14000)
    throw new CareError("careos_context_too_large", 400);
  return { payload, passages };
}

export async function resolveTurn(options: {
  data: DemoData;
  input: TurnInput;
  sources: KnowledgeSource[];
  history: CareTurn[];
  mode: "fixture" | "disabled" | "responses";
  model?: CareModel;
  call?: <T>(
    work: (signal: AbortSignal) => Promise<ModelResult<T>>,
  ) => Promise<T>;
  guardian?: GuardianView[];
  recall?: RecallEvidence;
  load?: {
    knowledge: () => Promise<KnowledgeSource[]>;
    guardian: () => Promise<GuardianView[]>;
    recall: () => Promise<RecallEvidence>;
    activity?: () => Promise<PurchaseActivity>;
  };
}): Promise<CareAnswer> {
  const { data, input, mode, model, call } = options;
  let sources = options.sources;
  if (input.example) {
    if (input.twinId) throw new CareError("careos_invalid_context", 400);
    const intent = isProhibited(input.message)
      ? "unsupported"
      : (input.intent ?? interpret(input.message));
    const recall =
      intent === "recall" && options.load
        ? await options.load.recall()
        : options.recall;
    return {
      outcome:
        intent === "receipt" || intent === "documents"
          ? ("missing" as const)
          : intent === "unsupported"
            ? ("unsupported" as const)
            : ("answered" as const),
      mode: "deterministic" as const,
      context: referenceContext,
      revision: input.revision,
      text:
        intent === "unsupported"
          ? "I cannot authorize payments, refunds or merchant changes."
          : intent === "receipt" || intent === "documents"
            ? "This fictional Insignia ownership example has no Purchase Twin, PayPal payment or saved receipt."
            : intent === "recall" && recall?.unavailable
              ? "The latest recall check is unavailable. The saved historical notice is not a current all-clear; verify the exact model and official remedy."
              : "This is fictional ownership of an Insignia NS-AF34D2 air fryer, not your verified purchase. Review the historical official CPSC notice and exact physical identifiers first. Replacement shopping does not resolve a recall.",
      steps: [],
      sources: recall
        ? [
            {
              id: `cpsc:${recall.hash}`,
              title: recall.title,
              label: "Official historical source · limited coverage",
              href: recall.url,
            },
          ]
        : [],
      actions: [
        {
          label: "Review official recall evidence and limits",
          href: "/safety?example=insignia",
        },
        {
          label: "Explore air-fryer comparison profiles",
          href: "/replacements?example=insignia",
        },
      ],
    };
  }
  const record = input.twinId ? findTwin(data, input.twinId) : undefined;
  if (input.twinId && !record)
    throw new CareError("careos_purchase_not_found", 404);
  if (isProhibited(input.message))
    return deterministicAnswer(data, input, "unsupported");
  if (record) {
    const brand = record.product.brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const namedModel = input.message.match(
      new RegExp(
        `\\b${brand}\\s+(?:model\\s+)?([a-z]?[- ]?\\d[\\w-]*)\\b`,
        "i",
      ),
    );
    const normalize = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");
    const foreignBrand = input.message.match(
      /\b(Sony|Bose|Apple|Samsung|Insignia)\b/i,
    )?.[0];
    if (
      (namedModel &&
        normalize(namedModel[1]) !== normalize(record.product.model)) ||
      (foreignBrand &&
        normalize(foreignBrand) !== normalize(record.product.brand))
    ) {
      return {
        ...purchaseSelection(
          data,
          input,
          (candidate) =>
            (!namedModel ||
              (normalize(candidate.product.brand) ===
                normalize(record.product.brand) &&
                normalize(candidate.product.model) ===
                  normalize(namedModel[1]))) &&
            (!foreignBrand ||
              normalize(candidate.product.brand) === normalize(foreignBrand)),
        ),
        text: `You mentioned ${namedModel ? `${record.product.brand} ${namedModel[1]}` : foreignBrand}, but ${record.product.brand} ${record.product.model} is selected. Choose the matching purchase; I won’t substitute this receipt or care guide.`,
      };
    }
  }
  const question = input.message.toLowerCase();
  const mentioned = data.products.filter((product) => {
    const alias = ["headphones", "kettle", "speaker"].includes(
      product.illustration,
    )
      ? product.illustration
      : "raspberry pi";
    return (
      question.includes(product.name.toLowerCase()) ||
      question.includes(`${product.brand} ${product.model}`.toLowerCase()) ||
      question.includes(alias)
    );
  });
  if (
    mentioned.length &&
    (!record || mentioned.some((product) => product.id !== record.product.id))
  ) {
    return {
      ...purchaseSelection(data, input, (candidate) =>
        mentioned.some((product) => product.id === candidate.twin.productId),
      ),
      text: "This is a different or unselected product. Which saved purchase should I use? Its receipt and documents will stay separate.",
    };
  }
  if (record && /receipt|invoice|proof of payment/i.test(input.message)) {
    const target =
      input.message.match(
        /\b(?:receipt|invoice|proof of payment)\s+for\s+(.+?)(?:[?.!]|$)/i,
      )?.[1] ??
      input.message.match(
        /\b(?:my|the)\s+(.+?)\s+(?:receipt|invoice|proof of payment)\b/i,
      )?.[1] ??
      input.message.match(
        /\b(?:find|show|open|get|locate|download|where(?:'s|\s+is))(?:\s+me)?\s+(?:(?:my|the)\s+)?(.+?)\s+(?:receipt|invoice|proof of payment)\b/i,
      )?.[1] ??
      input.message.match(
        /^(.+?)\s+(?:receipt|invoice|proof of payment)\b/i,
      )?.[1];
    if (target) {
      const normalize = (s: string) =>
        s
          .toLowerCase()
          .replace(/[^a-z0-9]/g, "")
          .replace(/s$/, "");
      const generic = new Set(
        [
          "the",
          "this",
          "these",
          "that",
          "those",
          "my",
          "saved",
          "original",
          "old",
          "new",
          "exact",
          "purchase",
          "product",
          "item",
          "order",
          "paypal",
          "find",
          "show",
          "open",
          "get",
          "locate",
          "download",
          "where",
          "wheres",
          "is",
          "me",
          "can",
          "could",
          "would",
          "you",
          "please",
          "i",
          "need",
          "want",
          "like",
          "did",
          "have",
          "do",
          "what",
          "which",
          "lost",
          "give",
        ].map(normalize),
      );
      const words = target
        .split(/\s+/)
        .map(normalize)
        .filter((s) => s && !generic.has(s));
      const matchesTarget = (product: typeof record.product) => {
        const aliases = [
          product.name,
          product.brand,
          product.model,
          product.illustration,
        ];
        const known = new Set(
          [...aliases, ...aliases.flatMap((s) => s.split(/\W+/))].map(
            normalize,
          ),
        );
        return (
          !!normalize(target) &&
          (known.has(normalize(target)) || words.every((s) => known.has(s)))
        );
      };
      if (!matchesTarget(record.product))
        return {
          ...purchaseSelection(data, input, (candidate) =>
            matchesTarget(candidate.product),
          ),
          text: `“${target}” doesn’t match the selected ${record.product.brand} ${record.product.model}. Choose the matching purchase; I won’t substitute this receipt.`,
        };
    }
  }
  let intent = input.intent ?? interpret(input.message);
  let classified = false;
  const history = options.history
    .filter((t) => t.answer.context?.twinId === input.twinId)
    .slice(-4)
    .map((t) => ({
      question: t.message.slice(0, 300),
      answer: [t.answer.text, ...t.answer.steps].join("\n").slice(0, 1200),
    }));
  // Language interpretation is useful only when deterministic routing is unsure.
  // Explicitly prohibited tasks never reach a model.
  const prohibited = isProhibited(input.message);
  if (prohibited) intent = "unsupported";
  if (
    !input.intent &&
    intent === "unsupported" &&
    !prohibited &&
    mode === "responses" &&
    model &&
    call
  ) {
    const { payload } = modelPayload(
      "classify",
      input.message,
      record
        ? { brand: record.product.brand, model: record.product.model }
        : null,
      history,
    );
    const classification = await call((signal) =>
      model.classify(payload, signal),
    );
    intent = classification.intent;
    classified = true;
  }
  // Only the requested evidence can make this answer unavailable. Never turn
  // unavailable relevant evidence into an empty/no-match success.
  if (options.load && record) {
    if (
      intent === "care" ||
      (intent === "documents" && /manual/i.test(input.message))
    )
      sources = await options.load.knowledge();
    if (intent === "guardian") options.guardian = await options.load.guardian();
    if (intent === "recall") options.recall = await options.load.recall();
  }
  const activity =
    record && (intent === "history" || intent === "important")
      ? await options.load?.activity?.()
      : undefined;
  const base = deterministicAnswer(
    data,
    input,
    intent,
    options.guardian,
    options.recall,
    activity,
  );
  if (classified) base.mode = "live";
  if (intent === "documents" && record && /manual/i.test(input.message)) {
    const matched = sources.some(
      (s) =>
        s.productId === record.product.id &&
        s.brand === record.product.brand &&
        s.model === record.product.model &&
        s.status === "approved",
    );
    return {
      ...base,
      outcome: matched ? ("answered" as const) : ("missing" as const),
      text: matched
        ? "Matched official guidance is available for this product. Open the guide to read its documented topics."
        : `No manufacturer manual is available for ${record.product.brand} ${record.product.model} in your records. Review this purchase’s saved documents instead.`,
      sources: base.sources.slice(0, 1),
      actions: [
        ...(!matched
          ? [
              {
                label: "Review saved documents",
                href: `/vault/${record.twin.id}#documents-heading`,
              },
            ]
          : []),
        {
          label: "Review product-care documentation",
          href: `/vault/${record.twin.id}/care`,
        },
      ],
    };
  }
  if (intent !== "care" || !record) {
    if (
      record &&
      base.outcome === "answered" &&
      [
        "summary",
        "policy",
        "guardian",
        "history",
        "important",
        "recall",
      ].includes(intent) &&
      mode === "responses" &&
      model?.selectEvidence &&
      call &&
      (classified ||
        /explain|why|what.*next|need to do|mean|help me understand/i.test(
          input.message,
        ))
    ) {
      const payload = evidencePayload(base, input.message, history);
      const selected = await call((signal) =>
        model.selectEvidence!(payload, signal),
      );
      return selectedEvidence(base, selected);
    }
    return base;
  }
  let evidence = retrievePassages(sources, record.product, input.message);
  if (classified && !evidence.passages.length && history.length) {
    // Recover the last grounded topic through two vague follow-ups. Re-load
    // current exact-model evidence; old transcript prose is never a source.
    for (const prior of options.history
      .filter((t) => t.answer.context?.twinId === input.twinId)
      .slice(-4)
      .reverse()) {
      const candidate = retrievePassages(
        sources,
        record.product,
        prior.message,
      );
      if (candidate.passages.length || candidate.conflict) {
        evidence = candidate;
        break;
      }
    }
  }
  if (evidence.conflict)
    return {
      ...base,
      outcome: "conflict" as const,
      text: "The available care sources conflict. Please review the originals; I won’t combine conflicting instructions.",
      actions: [
        { label: "Review sources", href: `/vault/${record.twin.id}/care` },
      ],
    };
  if (!evidence.passages.length) {
    const hasGuide = sources.some(
      (s) =>
        s.productId === record.product.id &&
        s.brand === record.product.brand &&
        s.model === record.product.model &&
        s.status === "approved",
    );
    return {
      ...base,
      text: hasGuide
        ? "The available guide does not cover that question. I won’t invent instructions; you can review its documented topics."
        : base.text,
      actions: hasGuide
        ? [
            {
              label: "Review available guidance",
              href: `/vault/${record.twin.id}/care`,
            },
          ]
        : base.actions,
    };
  }
  if (mode === "fixture") return fixtureCare(base, evidence.passages);
  if (mode === "disabled")
    return {
      ...base,
      text: "Model assistance is disabled. You can read the matched official guide directly.",
      actions: [
        {
          label: "Open product-care guide",
          href: `/vault/${record.twin.id}/care`,
        },
      ],
    };
  if (!model || !call) throw new CareError("careos_live_not_authorized");
  const selected = modelPayload(
    "care",
    input.message,
    { brand: record.product.brand, model: record.product.model },
    history,
    evidence.passages,
  );
  const explained = await call((signal) =>
    model.explain(selected.payload, signal),
  );
  return groundedAnswer(base, explained, selected.passages);
}
