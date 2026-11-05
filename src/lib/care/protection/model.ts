import { createHash } from "node:crypto";
import { z } from "zod";
import { eligible } from "../../price-guardian/eligibility";
import { money } from "../../demo/presentation";
import {
  guardianRules,
  guardianTerms,
  guardianPolicyHash,
  validatePolicy,
  GUARDIAN_PRODUCT,
  MERCHANT_ID,
} from "../../price-guardian/policy";
import {
  PROTECTION_STOP_AT,
  protectionLabels,
  type ProtectionEvidence,
  type ProtectionView,
  type SavedProtection,
} from "./contracts";

const date = z.iso.datetime({ offset: true });
const amount = z.int().min(1).max(20000);
export const protectionInputSchema = z.object({
  twinId: z.uuid(),
  merchantId: z.uuid(),
  productId: z.uuid(),
  origin: z.enum(["sample", "sandbox"]),
  originalMinor: z.int().nonnegative(),
  currency: z.string(),
  brand: z.string(),
  model: z.string(),
  verifiedAt: date.nullable(),
  capturedAt: date.nullable(),
  orderCreatedAt: date.nullable(),
  boundAt: date.nullable(),
  bindingHash: z.string().nullable(),
  policyHash: z.string().nullable(),
  policyVersion: z.string().nullable(),
  policyRules: z.unknown(),
  policyTerms: z.string().nullable(),
  approvedAt: date.nullable(),
  policyDocuments: z
    .array(z.object({ id: z.uuid(), content: z.string() }))
    .max(100),
  catalogBrand: z.string(),
  catalogModel: z.string(),
  catalogMinor: z.int(),
  catalogCurrency: z.string(),
  hasPriorAdjustment: z.boolean(),
});
export type ProtectionInput = z.infer<typeof protectionInputSchema>;
export const protectionPolicyInputSchema = protectionInputSchema.omit({
  catalogBrand: true,
  catalogModel: true,
  catalogMinor: true,
  catalogCurrency: true,
  hasPriorAdjustment: true,
});
type ProtectionPolicyInput = z.infer<typeof protectionPolicyInputSchema>;
const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([key, item]) => [key, canonical(item)]),
        )
      : value;
export const evidenceHash = (value: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
export function discoverProtectionPolicy(
  input: ProtectionPolicyInput,
  now: Date,
) {
  const fail = (reason: string) => ({ verified: false as const, reason });
  if (input.origin !== "sandbox" || !input.verifiedAt || !input.capturedAt)
    return fail(
      "No verified purchase-bound price-adjustment policy is established for this sample ownership.",
    );
  if (
    input.merchantId !== MERCHANT_ID ||
    input.productId !== GUARDIAN_PRODUCT ||
    input.brand !== guardianRules.brand ||
    input.model !== guardianRules.model ||
    input.currency !== "USD" ||
    !amount.safeParse(input.originalMinor).success
  )
    return fail(
      "The merchant, exact variant, currency or original amount is unsupported.",
    );
  if (
    input.bindingHash !== guardianPolicyHash ||
    input.policyHash !== guardianPolicyHash ||
    input.policyVersion !== guardianRules.version ||
    !validatePolicy(
      input.policyRules,
      input.policyTerms ?? "",
      input.policyHash ?? "",
    )
  )
    return fail(
      "No approved policy is bound to this purchase. Later policies are not retroactive; a catalog difference is not eligibility.",
    );
  const documents = input.policyDocuments.filter(
    (d) => d.content === guardianTerms,
  );
  if (documents.length !== 1)
    return fail(
      "The original applicable policy document is missing or conflicting.",
    );
  const capture = Date.parse(input.capturedAt),
    approved = Date.parse(input.approvedAt ?? ""),
    bound = Date.parse(input.boundAt ?? ""),
    ordered = Date.parse(input.orderCreatedAt ?? "");
  if (
    ![capture, approved, bound, ordered, now.getTime()].every(
      Number.isFinite,
    ) ||
    approved > ordered ||
    bound < ordered ||
    bound > capture ||
    capture > now.getTime() ||
    Date.parse(input.verifiedAt) > now.getTime()
  )
    return fail(
      "Policy approval, original binding or capture timing could not be verified.",
    );
  return {
    verified: true as const,
    deadline: new Date(
      capture + guardianRules.windowSeconds * 1000,
    ).toISOString(),
    sourceUrl: `/documents/${documents[0].id}`,
    facts: {
      version: "protection-policy-v1",
      input: protectionPolicyInputSchema.parse(input),
      sourceDocumentId: documents[0].id,
      deadline: new Date(
        capture + guardianRules.windowSeconds * 1000,
      ).toISOString(),
    },
  };
}
const catalogSchema = z.strictObject({
  version: z.literal("protection-catalog-v1"),
  merchantId: z.literal(MERCHANT_ID),
  productId: z.literal(GUARDIAN_PRODUCT),
  brand: z.literal("Forma"),
  model: z.literal("F-01"),
  currency: z.literal("USD"),
  minor: amount,
  priorId: z.uuid().nullable(),
});
export function validProtectionCatalog(row: ProtectionEvidence) {
  if (
    row.kind !== "catalog" ||
    row.source !== "forma-catalog" ||
    row.sourceUrl !== "/shop" ||
    evidenceHash(row.facts) !== row.contentHash
  )
    return null;
  const parsed = catalogSchema.safeParse(row.facts);
  return parsed.success ? parsed.data : null;
}
export function qualifyingProtectionDrop(
  input: ProtectionInput,
  current: ProtectionEvidence,
  prior: ProtectionEvidence | undefined,
  now: Date,
) {
  const price = validProtectionCatalog(current),
    previous = prior ? validProtectionCatalog(prior) : null;
  if (
    !price ||
    !previous ||
    !prior ||
    price.priorId !== prior.id ||
    prior.twinId !== input.twinId ||
    current.twinId !== input.twinId ||
    Date.parse(prior.retrievedAt) >= Date.parse(current.retrievedAt) ||
    Date.parse(prior.retrievedAt) <= Date.parse(input.capturedAt ?? "")
  )
    return null;
  return eligible({
    origin: input.origin,
    merchantId: input.merchantId,
    productId: input.productId,
    brand: input.brand,
    model: input.model,
    currency: input.currency,
    originalMinor: input.originalMinor,
    quantity: 1,
    fullPrice: true,
    capturedAt: input.capturedAt!,
    binding: {
      rules: input.policyRules,
      terms: input.policyTerms!,
      hash: input.policyHash!,
      approvedAt: input.approvedAt!,
      boundAt: input.boundAt!,
      orderCreatedAt: input.orderCreatedAt!,
    },
    price: {
      merchantId: price.merchantId,
      productId: price.productId,
      currency: price.currency,
      minor: price.minor,
      previousMinor: previous.minor,
      observedAt: current.retrievedAt,
    },
    hasPriorAdjustment: input.hasPriorAdjustment,
    now: now.getTime(),
  });
}
/** Unchanged daily observations retain the original qualifying event; they do
 * not manufacture a new drop or notify again. A rebound breaks this chain. */
export function currentProtectionDrop(
  input: ProtectionInput,
  catalogs: ProtectionEvidence[],
  now: Date,
) {
  let current = catalogs.at(-1);
  const visited = new Set<string>();
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    const price = validProtectionCatalog(current);
    const prior = catalogs.find((row) => row.id === price?.priorId);
    if (!price || !prior) return null;
    const result = qualifyingProtectionDrop(input, current, prior, now);
    if (result?.eligible) return { result, event: current, prior };
    const previous = validProtectionCatalog(prior);
    if (
      !previous ||
      prior.twinId !== input.twinId ||
      current.twinId !== input.twinId ||
      price.minor !== previous.minor ||
      Date.parse(prior.retrievedAt) >= Date.parse(current.retrievedAt) ||
      Date.parse(current.retrievedAt) > now.getTime()
    )
      return null;
    current = prior;
  }
  return null;
}
/** Read model revalidates saved evidence. A worker/model status string is not proof. */
export function protectionView(
  twinId: string,
  saved: SavedProtection,
  options: { now: Date; scheduled: boolean; input?: ProtectionInput },
): ProtectionView {
  const base: ProtectionView = {
    twinId,
    state: "unavailable",
    label: protectionLabels.unavailable,
    detail:
      "An applicable merchant policy, verified window and supported monitoring source have not been established. Review the original policy or ask North what is missing.",
    deadline: null,
    lastCheckedAt: null,
    nextCheckAt: null,
    policyVerified: false,
    monitoring: false,
    differenceMinor: null,
    sources: [],
    notifications: [],
  };
  const job = saved.jobs.find((j) => j.twinId === twinId);
  const rows = saved.evidence
    .filter(
      (e) =>
        e.twinId === twinId &&
        Date.parse(e.retrievedAt) <= options.now.getTime() &&
        evidenceHash(e.facts) === e.contentHash,
    )
    .sort(
      (a, b) =>
        a.retrievedAt.localeCompare(b.retrievedAt) || a.id.localeCompare(b.id),
    );
  const policyRow = rows
    .filter((r) => r.kind === "policy" && r.source === "purchase-policy")
    .at(-1);
  const policyInput = protectionPolicyInputSchema.safeParse(
    policyRow?.facts.input,
  );
  const discovery = policyInput.success
    ? discoverProtectionPolicy(policyInput.data, options.now)
    : null;
  const supplied = options.input;
  if (policyInput.success && !supplied)
    return {
      ...base,
      detail:
        "Current original purchase/policy facts are unavailable; saved evidence alone cannot establish current protection.",
    };
  if (policyInput.success && policyInput.data.twinId !== twinId) return base;
  if (
    supplied &&
    policyInput.success &&
    [
      "merchantId",
      "productId",
      "origin",
      "originalMinor",
      "currency",
      "brand",
      "model",
      "capturedAt",
      "verifiedAt",
      "bindingHash",
      "policyHash",
      "policyVersion",
      "policyRules",
      "policyTerms",
      "policyDocuments",
      "approvedAt",
      "boundAt",
      "orderCreatedAt",
    ].some(
      (key) =>
        evidenceHash(supplied[key as keyof ProtectionInput]) !==
        evidenceHash(policyInput.data[key as keyof ProtectionPolicyInput]),
    )
  )
    return {
      ...base,
      detail:
        "Saved protection evidence no longer matches the original purchase facts. Review the source; no eligibility is assumed.",
    };
  if (!saved.complete)
    return {
      ...base,
      detail:
        "Protection evidence is unavailable or incomplete. Missing information is not proof of coverage or monitoring.",
    };
  if (
    !policyRow ||
    !policyInput.success ||
    !discovery?.verified ||
    policyRow.sourceUrl !== discovery.sourceUrl ||
    policyRow.facts.deadline !== discovery.deadline
  ) {
    const gap = rows
      .filter((r) => r.kind === "unavailable" && r.source === "unavailable")
      .at(-1);
    return {
      ...base,
      ...(job?.state === "queued" && options.scheduled
        ? {
            state: "policy-checking" as const,
            label: protectionLabels["policy-checking"],
          }
        : {}),
      detail:
        gap && typeof gap.facts.reason === "string"
          ? gap.facts.reason
          : base.detail,
      sources: gap
        ? [{ label: "Recorded policy discovery", href: gap.sourceUrl }]
        : [],
    };
  }
  const input = supplied!;
  base.policyVerified = true;
  base.deadline = discovery.deadline;
  base.sources = [
    { label: "Original applicable merchant policy", href: discovery.sourceUrl },
  ];
  base.state = "verified";
  base.label = protectionLabels.verified;
  base.detail = `Original approved ${guardianRules.version} policy · exact Everyday Goods Forma F-01, USD, one full-price item, at most one USD 20 adjustment. Coupons, memberships, bundles, shipping, taxes and prior adjustments are excluded. Exclusive deadline ${discovery.deadline}. Merchant approval remains required; nothing is sent or refunded.`;
  const catalogs = rows.filter((r) => validProtectionCatalog(r));
  const latest = catalogs.at(-1);
  const drop = currentProtectionDrop(input, catalogs, options.now);
  const result = drop?.result;
  const prior = drop?.prior;
  const expired = options.now.getTime() >= Date.parse(discovery.deadline);
  const fresh =
    latest &&
    options.now.getTime() - Date.parse(latest.retrievedAt) <= 36 * 3600000;
  const sourceSupported =
    input.catalogBrand === input.brand &&
    input.catalogModel === input.model &&
    input.catalogCurrency === "USD" &&
    amount.safeParse(input.catalogMinor).success;
  base.lastCheckedAt = job?.lastCheckedAt ?? null;
  base.nextCheckAt = job?.nextCheckAt ?? null;
  base.monitoring = !!(
    options.scheduled &&
    sourceSupported &&
    !input.hasPriorAdjustment &&
    options.now.getTime() < Date.parse(PROTECTION_STOP_AT) &&
    job?.state === "supported" &&
    job.lastCheckedAt &&
    Date.parse(job.lastCheckedAt) <= options.now.getTime() &&
    options.now.getTime() - Date.parse(job.lastCheckedAt) <= 36 * 3600000 &&
    Date.parse(job.nextCheckAt) > options.now.getTime() &&
    fresh &&
    !expired
  );
  if (expired) base.state = "expired";
  else if (
    result?.eligible &&
    fresh &&
    sourceSupported &&
    job?.state === "supported"
  ) {
    base.state = "opportunity";
    base.differenceMinor = result.amountMinor;
  } else if (
    Date.parse(discovery.deadline) - options.now.getTime() <=
    48 * 3600000
  )
    base.state = "ending";
  else if (result?.eligible) base.state = "drop-detected";
  else if (base.monitoring) base.state = "watching";
  if (input.hasPriorAdjustment) {
    base.state = "unavailable";
    base.detail +=
      " An adjustment workflow is already recorded; this monitor cannot create a second opportunity.";
  }
  base.label = protectionLabels[base.state];
  if (latest) {
    const observed = validProtectionCatalog(latest)!;
    base.detail += ` Last recorded fictional catalog price ${money(observed.minor)} at ${latest.retrievedAt}.`;
    if (result?.eligible && prior)
      base.detail += ` Actual supported checks changed from ${money(validProtectionCatalog(prior)!.minor)} at ${prior.retrievedAt} to ${money(observed.minor)}. Potential adjustment ${money(result.amountMinor)}, not confirmed savings. Historical purchase-to-purchase differences were not used as a price-change event.`;
  }
  if (latest)
    base.sources.push({
      label: `Recorded fictional catalog check ${latest.retrievedAt}`,
      href: latest.sourceUrl,
    });
  base.detail += base.monitoring
    ? ` Daily supported catalog checks are active. Last ${base.lastCheckedAt}; next due ${base.nextCheckAt}.`
    : " Active price monitoring is not confirmed. Review the source and available next step.";
  if (job?.state === "error") {
    const failure = rows.filter((row) => row.kind === "unavailable").at(-1);
    if (typeof failure?.facts.reason === "string")
      base.detail += ` ${failure.facts.reason}`;
  }
  for (const notice of saved.notifications.filter((n) => n.twinId === twinId)) {
    const evidence = rows.find((e) => e.id === notice.evidenceId);
    if (!evidence) continue;
    if (
      Date.parse(notice.createdAt) > options.now.getTime() ||
      Date.parse(notice.createdAt) < Date.parse(evidence.retrievedAt)
    )
      continue;
    const eventPrior = catalogs.find(
      (e) => e.id === validProtectionCatalog(evidence)?.priorId,
    );
    const eventDrop =
      notice.kind === "opportunity"
        ? qualifyingProtectionDrop(
            { ...input, hasPriorAdjustment: false },
            evidence,
            eventPrior,
            new Date(evidence.retrievedAt),
          )
        : null;
    if (
      notice.kind === "opportunity"
        ? !eventDrop?.eligible
        : evidence.id !== policyRow.id ||
          evidence.kind !== "policy" ||
          Date.parse(discovery.deadline) - Date.parse(notice.createdAt) >
            48 * 3600000 ||
          Date.parse(notice.createdAt) >= Date.parse(discovery.deadline)
    )
      continue;
    base.notifications.push({
      id: notice.id,
      kind: notice.kind,
      at: notice.createdAt,
      historical:
        expired ||
        input.hasPriorAdjustment ||
        (notice.kind === "opportunity" && base.state !== "opportunity"),
    });
  }
  return base;
}
