import { z } from "zod";
import type { CareAnswer } from "./contracts";

/** Reviewed interface facts, not purchase/manufacturer evidence or authority. */
export const productGuide = {
  overview: {
    title: "How Pal Care works",
    href: "/dashboard",
    facts:
      "Pal Care: saved purchases, receipts, source-backed aftercare. Care → Purchases & Docs → Insights. PayPal: verified Sandbox. North: evidence help/view requests. AG Studio: native charts/grids/KPIs. Independent demo, not complete PayPal history.",
  },
  care: {
    title: "Care",
    href: "/dashboard",
    facts:
      "Care: attention cards, saved/example timeline, all products. Shortcuts: Find a receipt, Returns & warranties, Prices & refunds, Product safety, Care guides. Dated product/sources; no live tracking/reminders.",
  },
  library: {
    title: "Purchases & Docs",
    href: "/purchases",
    facts:
      "Purchases & Docs → Purchases / Documents. Filters & sort → intended dated product. Ask via either North button; no page search bar. Example ≠ Verified Sandbox. No universal import/uploads.",
  },
  receipts: {
    title: "Receipts and documents",
    href: "/documents",
    facts:
      "Purchases & Docs → Documents → category/purchase filters; Care → Find a receipt. Dated purchase → Documents → View original record/download. Ask in North. Example receipts fictional; missing stays missing.",
  },
  deadlines: {
    title: "Returns and warranty evidence",
    href: "/documents?documentCategory=warranties",
    facts:
      "Care → Returns & warranties; dated product → milestone/sources. Documents: Returns / Warranty filters. Saved dates, no coverage from payment. Editable/unsent enquiry; no claim submission/refund.",
  },
  insights: {
    title: "Insights",
    href: "/insights",
    facts:
      "Insights: My Purchases / Documents & Care / Price Adjustments. Native AG Studio KPIs/charts/grid + evidence. Separate Example/Sandbox amounts; missing ≠ zero. Loaded window only; no promised savings.",
  },
  filters: {
    title: "Insights filters",
    href: "/insights",
    facts:
      "Insights → Filters & sort: category/source/date/search. Chart category cross-filters grid/KPIs/evidence; check scope/counts. Clear filters clears filters/selection. HOW explains; DO needs verified SDK/data.",
  },
  layouts: {
    title: "Insights layout",
    href: "/insights",
    facts:
      "Insights → Customize layout: native widgets. Save layout / Restore layout: browser-local; Reset views: defaults. No cloud/device sync/purchase changes. Explanation ≠ execution.",
  },
  north: {
    title: "Using North",
    href: "/dashboard",
    facts:
      "Explore with North / corner star: one overlay. Select a dated purchase; Open purchase/View receipt/Care details use saved routes without AI. 'Take me there' uses selection. New chat keeps chats; Previous chats restores; History reads, no resend. Drafts/context persist. No payment/access/scheduling authority.",
  },
  prices: {
    title: "Prices and recorded adjustments",
    href: "/guardian",
    facts:
      "Care → Prices & refunds; dated product → price/sources. Insights → Price Adjustments: saved outcomes. Dated retailer references/fictional checks ≠ live monitoring, eligibility, savings or issued refunds.",
  },
  safety: {
    title: "Product safety",
    href: "/safety",
    facts:
      "Care → Product safety; dated product → safety milestone/official evidence. Limited coverage: verify exact model. No match ≠ all-clear, alert subscription or continuous recall monitoring.",
  },
  limits: {
    title: "Scope and limits",
    href: "/about",
    facts:
      "Fictional/Sandbox demo: no universal import/uploads/scanner, external reminders, live tracking/monitoring, guaranteed coverage/refunds or financial execution. Genuine North needs valid permission/allowance; libraries/native Insights work without AI.",
  },
} as const;

export const productGuideFeatureSchema = z.enum([
  "overview",
  "care",
  "library",
  "receipts",
  "deadlines",
  "insights",
  "filters",
  "layouts",
  "north",
  "prices",
  "safety",
  "limits",
]);
// Historical shape only: keep old malformed prose readable, without defaults,
// transforms or publication checks. Fresh output uses the separate schema below.
export const productGuideStoredReplySchema = z.strictObject({
  text: z.string().min(20).max(620),
  steps: z.array(z.string().min(5).max(180)).min(1).max(5),
  features: z.array(productGuideFeatureSchema).min(1).max(3),
});
// Only this basic punctuation pattern is model-visible. Full Unicode/control,
// absolute-end and non-ellipsis checks stay local, not portable wire promises.
const guideSentenceEnding = /[.!?。！？]["'”’»)\]}」』】）]?$/;
const safeGuideProse = z
  .string()
  .regex(guideSentenceEnding, "Guide prose must end with sentence punctuation")
  .refine(
    (value) =>
      /\S/.test(value) &&
      !/\s$/.test(value) &&
      /[\p{L}\p{N}]/u.test(value) &&
      !/(?:\.{2,}|…+)[.!?。！？]?["'”’»)\]}」』】）]?$/u.test(value),
    "Guide prose must contain words and finish without an ellipsis",
  )
  .refine(
    (value) =>
      !/[\p{Cf}\u034f\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/u.test(
        value,
      ),
    "Guide prose contains a prohibited format or control character",
  );
// Reject unchanged: no stripping, completion, cap increase or provider retry.
export const productGuideReplySchema = productGuideStoredReplySchema.extend({
  text: safeGuideProse.min(20).max(620),
  steps: z.array(safeGuideProse.min(5).max(180)).min(1).max(5),
});
export type ProductGuideReply = z.infer<typeof productGuideReplySchema>;
export const productGuideModelFacts = Object.fromEntries(
  Object.entries(productGuide).map(([id, entry]) => [id, entry.facts]),
);

/** Genuine interpretation has already been accounted. No model URLs/record IDs,
 * tool execution or provider work: resolve only known interface links/sources. */
export function productGuideAnswer(
  raw: ProductGuideReply,
): Pick<CareAnswer, "outcome" | "text" | "steps" | "sources" | "actions"> {
  const reply = productGuideReplySchema.parse(raw);
  const features = [...new Set(reply.features)];
  return {
    outcome: "answered",
    text: reply.text,
    steps: reply.steps,
    sources: features.map((id) => ({
      id: `palcare-interface-${id}`,
      title: productGuide[id].title,
      label: "Pal Care interface guide · not purchase or manufacturer evidence",
      href: productGuide[id].href,
      excerpt: productGuide[id].facts,
    })),
    actions: features
      .filter(
        (id, index) =>
          features.findIndex(
            (other) => productGuide[other].href === productGuide[id].href,
          ) === index,
      )
      .map((id) => ({
        label: `Open ${productGuide[id].title}`,
        href: productGuide[id].href,
      })),
  };
}
