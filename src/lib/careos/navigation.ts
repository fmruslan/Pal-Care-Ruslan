import { z } from "zod";
import { careContextSchema } from "./contracts";

export const navigationDestinations = [
  "purchase",
  "receipt",
  "documents",
  "care",
  "warranty",
  "returns",
  "insights",
] as const;
export type NavigationDestination = (typeof navigationDestinations)[number];
const localHref = z
  .string()
  .regex(
    /^\/(?:vault\/[a-f0-9-]+(?:\?milestone=(?:purchase|warranty|returns)|#(?:documents-heading|care-heading))?|documents\/[a-f0-9-]+|insights)$/,
  );
export const purchaseNavigationSchema = z.strictObject({
  context: careContextSchema,
  actions: z
    .array(
      z.strictObject({
        destination: z.enum(navigationDestinations),
        label: z.string(),
        href: localHref,
      }),
    )
    .max(8),
});
export type PurchaseNavigation = z.infer<typeof purchaseNavigationSchema>;

/** Small whole-utterance shortcuts, not a replacement for semantic questions.
 * A named target may only be used after the user explicitly picked its record. */
export function navigationIntent(
  message: string,
  choosing = false,
): NavigationDestination | "back" | "other" | null {
  const text = message
    .trim()
    .toLowerCase()
    .replace(/[.!?]+$/, "")
    .replace(/^please\s+/, "")
    .replace(/^now\s+/, "");
  if (/^(?:go|take me) back$/.test(text)) return "back";
  if (
    /^(?:(?:show|open)(?: me)? )?(?:the )?other (?:one|purchase|headphones)$/.test(
      text,
    )
  )
    return "other";
  if (
    /^(?:show (?:this|it|that purchase) in|open|go to|take me to) insights$/.test(
      text,
    )
  )
    return "insights";
  if (
    /^(?:take me there|open it|that one|open that one|show me that purchase|show me (?:it|that one)|take me to (?:it|that purchase)|open (?:the )?selected purchase)$/.test(
      text,
    )
  )
    return "purchase";
  const command = /^(?:open|show(?: me)?|take me to|go to) (.+)$/.exec(text);
  if (!command) return null;
  const target = command[1];
  if (
    /^(?:its|my|the|this|that|the selected purchase['’]s) (?:receipt|invoice)$/.test(
      target,
    )
  )
    return "receipt";
  if (/^(?:its|the|this purchase['’]s) (?:documents|paperwork)$/.test(target))
    return "documents";
  if (
    /^(?:its|the|this purchase['’]s) care(?: details| history)?$/.test(target)
  )
    return "care";
  if (
    /^(?:its|the|this purchase['’]s) warranty(?: details| document)?$/.test(
      target,
    )
  )
    return "warranty";
  if (
    /^(?:its|the|this purchase['’]s) return(?:s| policy| details)?$/.test(
      target,
    )
  )
    return "returns";
  // The explicit dated choice supplies the target. Never use a compound or
  // consequential request as a navigation-only shortcut.
  if (
    choosing &&
    /^(?:my|the) [\p{L}\p{N} '-]+$/u.test(target) &&
    !/\b(and|then|refund|pay|buy|delete|change|cancel)\b/.test(target)
  ) {
    if (/\b(receipt|invoice)$/.test(target)) return "receipt";
    if (/\b(documents|paperwork)$/.test(target)) return "documents";
    if (/\bwarranty(?: details)?$/.test(target)) return "warranty";
    if (/\breturn policy$/.test(target)) return "returns";
    if (/\bcare details$/.test(target)) return "care";
    return "purchase";
  }
  return null;
}
