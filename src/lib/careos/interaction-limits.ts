import type { CareAnswer } from "./contracts";
import { scriptedCustomerPlan } from "../intelligence/customer-commands";

/** 1A honesty guard, NOT library retrieval or an analytics intent interpreter. */
export function libraryQuestionPending(message: string) {
  const text = message
    .normalize("NFKC")
    .toLowerCase()
    // Explicit correction clauses are not positive scope requests.
    .replace(
      /\b(?:not|rather than|instead of)\s+(?:(?:my|the)\s+)?(?:(?:entire|whole|all)\s+)?(?:(?:my|the|saved)\s+)?(?:purchase\s+)?(?:library|purchases|receipts|history)\b/g,
      "",
    )
    .replace(
      /\b(?:not|rather than|instead of)\s+(?:this|that|selected|current|focused)\s+(?:purchase|product|item|order)\b/g,
      "",
    );
  const library =
    /\blibrary\b|\b(all|every|everything|entire|whole)\b.{0,35}\b(purchases?|bought|receipts?|library|spen[dt])\b|\bwhat\s+(?:did|have)\s+i\s+(?:buy|bought|purchased?)\b|\b(?:list|show|find)\b.{0,35}\bpurchases\b|\bpurchases?\b.{0,35}\b(last|past|previous|three|3|months?|date range)\b|\b(?:recorded\s+)?purchase\s+totals\b|\b(?:total|sum)\b.{0,35}\b(purchases|value|paid)\b|\b(which|find)\b.{0,35}\b(products|purchases)\b.{0,35}\b(receipts?|documents?|care|guidance|manuals?)\b/.test(
      text,
    );
  if (library) return true;
  const single =
    /\b(this|that|selected|current|focused)\s+(purchase|product|item|order)\b|\bthese\s+(headphones|speakers?)\b/.test(
      text,
    );
  return !single && /\b(spending|spend|spent)\b/.test(text);
}

/** Preserve existing native view requests; explicit product tasks use care even on Insights. */
export function verifiedReceiptRequest(message: string) {
  return (
    /\b(paypal|verified|sandbox)\b/i.test(message) &&
    /\b(receipt|invoice|proof of payment)\b/i.test(message)
  );
}

export function questionUsesInsights(
  message: string,
  hasProduct: boolean,
  explicitProductTask = false,
) {
  if (explicitProductTask) return false;
  if (verifiedReceiptRequest(message)) return true;
  // Retain the existing native presentation vocabulary, not new library-query
  // capabilities. A library question elsewhere still receives the 1A guard.
  const presentation =
    !!scriptedCustomerPlan(message) ||
    /\b(chart|dashboard|view|widget|grid)\b/i.test(message);
  if (libraryQuestionPending(message) && !presentation) return false;
  return (
    presentation ||
    !hasProduct ||
    !/\b(receipt|manual|clean|care|repair|policy|recall|summary|summarize|how\s+much|payment)\b|\b(this|that|selected|current|focused)\s+(purchase|product|item|order)\b|\bwhen\b.*\b(buy|bought)\b/i.test(
      message,
    )
  );
}

export function pendingLibraryAnswer(revision: number): CareAnswer {
  return {
    outcome: "unsupported",
    mode: "deterministic",
    questionScope: "library",
    context: null,
    revision,
    text: "This question needs your saved purchase library. Library-wide lists, date queries and calculated totals are coming in the next checkpoints. I haven’t treated one product’s price as a total. Your purchase context is kept; you can explore the saved records in Purchases or Insights now.",
    steps: [],
    sources: [],
    actions: [
      { label: "Explore saved records in Insights", href: "/insights" },
      { label: "Open saved purchases", href: "/vault" },
    ],
  };
}
