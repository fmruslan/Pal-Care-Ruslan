import { z } from "zod";
import type { CareAnswer } from "./contracts";

/** Reviewed interface facts, not purchase/manufacturer evidence or authority. */
export const productGuide = {
  overview: {
    title: "How Pal Care works",
    href: "/dashboard",
    facts:
      "Care → Purchases & Docs → Insights. PayPal: verified Sandbox evidence. North: saved-evidence help/supported view requests. AG Studio: real charts/grids/KPIs. Independent demo, not complete PayPal history.",
  },
  care: {
    title: "Care",
    href: "/dashboard",
    facts:
      "Default Care: attention cards, saved/example timeline, all products. Shortcuts: Find a receipt, Returns & warranties, Prices & refunds, Product safety, Care guides. Open dated product/source details; no live tracking/reminders.",
  },
  library: {
    title: "Purchases & Docs",
    href: "/purchases",
    facts:
      "Purchases & Docs → Purchases / Documents switch. Search; Filters & sort; open intended dated product. Example purchase ≠ Verified Sandbox; similar headphones have distinct histories. No universal import/uploads.",
  },
  receipts: {
    title: "Receipts and documents",
    href: "/documents",
    facts:
      "Purchases & Docs → Documents → search/filter, or Care → Find a receipt. Dated purchase → Documents → View original record/download. Example receipts are fictional, not manuals/verified payments. Missing stays missing.",
  },
  deadlines: {
    title: "Returns and warranty evidence",
    href: "/documents?documentCategory=warranties",
    facts:
      "Care → Returns & warranties; dated product → milestone/sources. Documents filters Returns / Warranty. Recorded dates only, no coverage from payment. Enquiry drafts are editable/unsent; no claim submission/refund.",
  },
  insights: {
    title: "Insights",
    href: "/insights",
    facts:
      "Insights: My Purchases / Documents & Care / Price Adjustments. Native AG Studio KPIs/charts/grid and evidence. Example/Sandbox amounts separate; missing isn't zero. Loaded saved window only; no promised savings.",
  },
  filters: {
    title: "Insights filters",
    href: "/insights",
    facts:
      "Insights → Filters & sort: category/source/date/search. Chart category cross-filters grid/KPIs/evidence; check scope/counts. Clear filters clears filters/selection. HOW is explanation; DO requires verified SDK/data.",
  },
  layouts: {
    title: "Insights layout",
    href: "/insights",
    facts:
      "Insights → Customize layout arranges native widgets. Save layout / Restore layout are browser-local; Reset views returns defaults. No cloud/device sync/purchase changes. Explanation isn't executed layout work.",
  },
  north: {
    title: "Using North",
    href: "/dashboard",
    facts:
      "Explore with North / corner star open one overlay; corner yields on dense content. New chat keeps old chats; Previous chats restores them; History reads without resending. Drafts/context persist. No payment/access/scheduling authority.",
  },
  prices: {
    title: "Prices and recorded adjustments",
    href: "/guardian",
    facts:
      "Care → Prices & refunds; dated product → price/sources. Insights → Price Adjustments: recorded outcomes. Dated retailer references/fictional checks aren't live monitoring, eligibility, savings or issued refunds.",
  },
  safety: {
    title: "Product safety",
    href: "/safety",
    facts:
      "Care → Product safety; dated product → safety milestone/official evidence. Limited coverage; verify exact model. No match isn't an all-clear, alert subscription or continuous recall monitoring.",
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
export const productGuideReplySchema = z.strictObject({
  text: z.string().min(20).max(620),
  steps: z.array(z.string().min(5).max(180)).min(1).max(5),
  features: z.array(productGuideFeatureSchema).min(1).max(3),
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
