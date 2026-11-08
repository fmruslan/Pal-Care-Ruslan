import {
  emptyRecordsQuery,
  recordsQuerySchema,
  RECORD_CATEGORIES,
  type RecordsQuery,
} from "./contracts";
import {
  customerRequestAllowed,
  explicitCustomerWorkspaceRequest,
} from "../../intelligence/customer-commands";

/** Retrospective buying language is a read question, not checkout authority.
 * All other consequential/injection guards remain the shared strict policy. */
export function recordsRequestAllowed(message: string) {
  return customerRequestAllowed(
    message
      .normalize("NFKC")
      .replace(
        /\bwhat (?:did|have) i (?:buy|bought)\b/gi,
        "my saved purchases",
      ),
  );
}

/** Small, disclosed fallback normalization; live conversation does not depend
 * on this grammar. Never fuzzy-match unknown product identities. */
export const normalizeRecordsLanguage = (s: string) =>
  s
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\b(?:purches|purchses|purhcases|purchaes)\b/g, "purchases")
    .replace(/\b(?:warrantys|warrenties|warrentys)\b/g, "warranties");
const normalize = normalizeRecordsLanguage;
const disallowed =
  /\b(?:refund|pay|capture|transfer|delete|drop|insert|update|grant|revoke|password|secret|credentials?|renew|bypass|activate|credits?)\b|https?:|javascript:|```|ignore.{0,40}(instructions|rules)/i;
const followup =
  /^(?:only\b|what about\b|how about\b|now (?:only|just)\b|and\b|put\b|make\b|format\b|list those\b|show (?:those|that)\b|what is (?:the )?(?:recorded )?total for (?:those|that)\b)/;
const shortFollowup =
  /^(?:the total|totals?|sum|as (?:bullets|a table)|in a (?:table|list)|table|(?:last|this) month)(?: please)?[?.!]?$/;

/** One scope rule for deterministic resolution and protected interpretation.
 * Previous selection is context only when the customer refers back to it; a
 * fresh library question must not expose stale filters for the model to inherit.
 * This chooses context, not authorization or the model's proposed predicates. */
export function recordsQueryContinuation(message: string) {
  const s = normalize(message).replace(/[?.!]+$/g, "");
  if (
    /\b(?:all|entire|whole) (?:(?:my|the|fictional|saved|sample|verified|sandbox|recorded) )*(?:purchases|library|purchase history)\b/.test(
      s,
    )
  )
    return false;
  return (
    followup.test(s) ||
    shortFollowup.test(s) ||
    /\b(?:previous|original|earlier|saved) (?:chart|result|analysis)\b/.test(
      s,
    ) ||
    /\b(?:those|these) (?:purchases|records|items|products|results)\b|\b(?:that|this) (?:(?:selected|saved) )?(?:analysis|selection|result|chart|breakdown|comparison)\b|\b(?:from|of|within|among|for) (?:those|these|them)\b/.test(
      s,
    ) ||
    /^(?:put|make|format|list|show|turn|return).{0,50}\b(?:those|that|results|them)\b.{0,40}\b(?:list|bullet|table|card)s?\b/.test(
      s,
    )
  );
}

/** Pure admission hint only. The server re-resolves every field against owned history. */
export function recordsCandidate(message: string, previous?: RecordsQuery) {
  const s = normalize(message);
  if (!s || s.length > 2000 || disallowed.test(s)) return false;
  if (explicitCustomerWorkspaceRequest(s)) return false;
  if (/^(?:new topic|start a new topic)[.!]?$/.test(s)) return true;
  if (
    /\b(?:its|this one|that one)\b|\b(?:this|that|selected|current) (?:purchase|product|item)\b/.test(
      s,
    ) &&
    !/\b(?:all|library|purchases)\b/.test(s)
  )
    return false;
  if (
    /\b(?:clean|shutdown|shut down|repair|firmware|warranty|recall|manual|care instructions|care for|power off)\b|\bdisconnect\b.{0,40}\bpower\b/.test(
      s,
    )
  )
    return false;
  return (
    followup.test(s) ||
    (!!previous && shortFollowup.test(s)) ||
    (recordsQueryContinuation(s) && !shortFollowup.test(s)) ||
    /\b(?:purchases|spending|spent|bought|documents|warranties|warranty)\b/.test(
      s,
    ) ||
    /\bwhich (?:purchases|products)\b|\bcompare (?:last|this) month\b|\b(?:all|saved|my|recorded)\b.{0,35}\b(?:purchases|receipts|totals|spending|library)\b|\b(?:what did i buy|what have i bought|how much (?:did|have) i spen[dt]|spending patterns|purchase totals|purchase value)\b|\b(?:find|list|show|search)\b.{0,50}\b(?:purchases|receipts|headphones|kettle|speaker|raspberry|pi 5)\b/.test(
      s,
    )
  );
}

/** Client admission hint only. Generic pronouns following a scoped product reply
 * stay with care; explicit library/date/category references can resume analysis.
 * Both server channels still validate their own owned history and authority. */
export function recordsTaskCandidate(
  message: string,
  previous: RecordsQuery | undefined,
  lastReplyWasPurchase: boolean,
) {
  if (!recordsCandidate(message, previous)) return false;
  if (
    lastReplyWasPurchase &&
    shortFollowup.test(normalize(message)) &&
    /\b(?:table|bullets|list)\b/.test(normalize(message))
  )
    return false;
  if (!lastReplyWasPurchase || !followup.test(normalize(message))) return true;
  return /\b(?:purchases|receipts|electronics|audio|kitchen|computing|priced|unpriced|last month|this month|months|recorded total|spending|chart|graph|table)\b|\b(?:that analysis|for those)\b/.test(
    normalize(message),
  );
}

function iso(date: Date) {
  return date.toISOString().slice(0, 10);
}
export function shiftMonth(date: string, months: number) {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const end = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  d.setUTCDate(Math.min(day, end));
  return iso(d);
}
export function previousPeriod(from: string, to: string) {
  const start = new Date(`${from}T00:00:00Z`);
  const finish = new Date(`${to}T00:00:00Z`);
  const length = finish.getTime() - start.getTime() + 86400000;
  // Calendar-month periods compare with the previous complete calendar month.
  if (
    from.endsWith("-01") &&
    iso(
      new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)),
    ) === to
  ) {
    return {
      from: shiftMonth(from, -1),
      to: iso(new Date(start.getTime() - 86400000)),
    };
  }
  return {
    from: iso(new Date(start.getTime() - length)),
    to: iso(new Date(start.getTime() - 86400000)),
  };
}

export type QueryResolution =
  { query: RecordsQuery; reuse: boolean } | { clarification: string } | null;
/** Bounded provider-free language. Unknown modifiers must not silently widen scope. */
export function resolveRecordsQuery(
  message: string,
  referenceDate: string,
  previous?: RecordsQuery,
): QueryResolution {
  if (!recordsCandidate(message, previous)) return null;
  const s = normalize(message).replace(/[?.!]+$/g, "");
  if (
    /\b(?:with|have|has) receipts?\b/.test(s) &&
    /\b(?:missing|without|no) receipts?\b/.test(s)
  )
    return {
      clarification:
        "Should the purchases have a saved receipt or be missing one? Those filters conflict.",
    };
  const namedMonths =
    s.match(
      /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\b/g,
    ) ?? [];
  if (
    namedMonths.length &&
    /\b(?:last|this|past)\b|\b\d{4}-\d{2}-\d{2}\b/.test(s)
  )
    return {
      clarification:
        "Please use one date range or one relative period, rather than conflicting period descriptions.",
    };
  if (
    /[$€£]|\b(?:under|over|cheaper|expensive|excluding|except|not|or|returned|refunded|csv|export|week|year|today|yesterday)\b/.test(
      s,
    )
  )
    return {
      clarification:
        "That modifier is not supported by the saved-record parser yet. Use a category, receipt filter, provenance, or an exact date range; no filter was silently dropped.",
    };
  const inherited = recordsQueryContinuation(s);
  if (inherited && !previous)
    return {
      clarification:
        "Which saved purchases should I use? Try ‘Show my purchases’ first.",
    };
  const query =
    inherited && previous
      ? { ...previous, categories: [...previous.categories] }
      : emptyRecordsQuery(referenceDate);
  query.referenceDate = referenceDate;
  if (/\b(?:bullet|linked list|in a list)\b/.test(s)) query.format = "bullets";
  else if (/\btable\b/.test(s)) query.format = "table";
  else if (/\bcards?\b/.test(s)) query.format = "cards";
  if (/\b(?:totals?|sum|how much|how many|purchase value)\b/.test(s))
    query.operation = "total";
  else if (/\b(?:patterns?|breakdown|by category|categories)\b/.test(s))
    query.operation = "breakdown";
  else if (!inherited) query.operation = "list";
  if (/\b(?:chart|graph)\b/.test(s)) {
    query.operation = "breakdown";
    query.format = "chart";
  }
  const compare = /\b(?:compare|compared|versus|vs)\b/.test(s);
  if (compare) query.operation = "compare";

  const dates = s.match(/\b\d{4}-\d{2}-\d{2}\b/g) ?? [];
  if (dates.length) {
    if (dates.length !== 2) {
      return {
        clarification:
          "Use a start and end date, for example 2026-10-01 to 2026-10-31.",
      };
    }
    query.from = dates[0];
    query.to = dates[1];
  } else if (/\b(?:last|past) (?:three|3) months\b/.test(s)) {
    query.from = shiftMonth(referenceDate, -3);
    query.to = referenceDate;
  } else if (/\blast month\b/.test(s)) {
    const start = `${referenceDate.slice(0, 7)}-01`;
    query.from = shiftMonth(start, -1);
    query.to = iso(
      new Date(new Date(`${start}T00:00:00Z`).getTime() - 86400000),
    );
  } else if (/\bthis month\b/.test(s)) {
    query.from = `${referenceDate.slice(0, 7)}-01`;
    query.to = referenceDate;
  } else {
    const months = [
      ...s.matchAll(
        /\b(january|february|march|april|may|june|july|august|september|october|november|december)(?: (\d{4}))?\b/g,
      ),
    ];
    if (months.length > 1)
      return {
        clarification:
          "Please give one exact start and end date for a multi-month range or comparison.",
      };
    const month = months[0];
    if (month) {
      const names = [
        "january",
        "february",
        "march",
        "april",
        "may",
        "june",
        "july",
        "august",
        "september",
        "october",
        "november",
        "december",
      ];
      const index = names.indexOf(month[1]);
      const year = Number(month[2] ?? referenceDate.slice(0, 4));
      query.from = `${year}-${String(index + 1).padStart(2, "0")}-01`;
      query.to = iso(new Date(Date.UTC(year, index + 1, 0)));
    }
  }
  if (
    (/\b(?:last|past|next) (?:week|year)|\bbetween\b/.test(s) &&
      !dates.length) ||
    (/\b\d+ months\b/.test(s) && !/\b3 months\b/.test(s))
  )
    return {
      clarification: "Please give an exact start and end date for that period.",
    };
  if (compare && (!query.from || !query.to))
    return {
      clarification:
        "Which period should I compare? Try ‘Compare last month with the previous month’.",
    };

  const categories = RECORD_CATEGORIES.filter((category) =>
    new RegExp(`\\b${category}\\b`, "i").test(s),
  );
  if (/\belectronics\b/.test(s)) categories.push("Audio", "Computing");
  if (categories.length) query.categories = [...new Set(categories)];
  else if (
    /^only\s/.test(s) &&
    !/\b(?:sample|sandbox|verified|receipts?|documents|missing|priced|unpriced|headphones|kettle|speaker|raspberry|pi)\b/.test(
      s,
    )
  )
    return {
      clarification:
        "Which category? Supported categories are Audio, Computing, Kitchen, Clothing, Home, Books and Games; Electronics means Audio + Computing.",
    };
  if (/\bsample\b/.test(s) && /\b(?:sandbox|verified|paypal)\b/.test(s))
    query.origin = "all";
  else if (/\b(?:sandbox|verified|paypal)\b/.test(s)) query.origin = "sandbox";
  else if (/\bsample\b/.test(s)) query.origin = "sample";
  if (/\b(?:missing|without|no) receipts?\b/.test(s)) query.receipt = "missing";
  else if (/\breceipts?\b/.test(s)) query.receipt = "present";
  if (/\b(?:missing|without|no) documents?\b/.test(s))
    query.document = "missing";
  else if (/\bdocuments?\b/.test(s)) query.document = "present";
  if (
    /\b(?:missing|without|unavailable) (?:prices?|amounts?)\b|\bunpriced\b/.test(
      s,
    )
  )
    query.price = "missing";
  else if (
    /\bwith (?:recorded )?prices?\b|\bonly priced\b|\bpriced purchases\b/.test(
      s,
    )
  )
    query.price = "present";
  const products = [
    "headphones",
    "kettle",
    "speaker",
    "raspberry pi",
    "pi 5",
  ].filter((word) => s.includes(word));
  const distinctProducts = [
    ...new Set(
      products.map((word) => (word === "pi 5" ? "raspberry pi" : word)),
    ),
  ];
  if (distinctProducts.length > 1)
    return {
      clarification:
        "Please search one product at a time or select their shared category. No product qualifier was dropped.",
    };
  if (products.length)
    query.search = products[0] === "pi 5" ? "raspberry pi" : products[0];
  const model = s.match(/\b(?:f-01|h-02|f-03)\b/);
  if (model) query.search = model[0];
  // Never ignore an unknown product/category qualifier and return every row.
  // This bounded grammar is deliberately conservative until model interpretation
  // is integrated behind its existing private authority.
  const knownWords = new Set(
    "show me my all saved available recorded purchase purchases products records results library find search list everything what did have i buy bought in the last past three 3 months month this from to through between only about and for those that them put make format as into a an linked bullets bullet points cards card table totals total sum calculate value spending spend spent how much patterns pattern by category categories compare compared with previous period against versus vs sample sandbox verified paypal receipts receipt missing without no has prices price unavailable amount amounts unpriced chart graph please current exactly of is return get audio computing kitchen electronics headphones kettle speaker raspberry pi 5 january february march april may june july august september october november december".split(
      " ",
    ),
  );
  for (const word of [
    "which",
    "on",
    "across",
    "whole",
    "entire",
    "filter",
    "filtered",
    "f-01",
    "h-02",
    "f-03",
    "documents",
    "document",
    "but",
    "priced",
    "now",
    "just",
    "many",
    "do",
  ])
    knownWords.add(word);
  const residual = s
    .replace(/\b\d{4}-\d{2}-\d{2}\b|\b\d{4}\b/g, "")
    .split(/[^\p{L}\p{N}-]+/u)
    .filter((word) => word && !knownWords.has(word));
  if (residual.length)
    return {
      clarification: `The limited saved-record fallback couldn't interpret ‘${residual.slice(0, 4).join(" ")}’. Conversational AI needs active browser/model access; no unknown condition was silently removed.`,
    };
  if (/\b(?:manual|product care)\b/.test(s))
    return {
      clarification:
        "Ask for an exact product’s documents or care using its saved purchase link. Receipt search is available here.",
    };
  const parsed = recordsQuerySchema.safeParse(query);
  const sameSelection =
    !!previous &&
    [
      "from",
      "to",
      "categories",
      "origin",
      "receipt",
      "document",
      "price",
      "search",
    ].every(
      (key) =>
        JSON.stringify(query[key as keyof RecordsQuery]) ===
        JSON.stringify(previous[key as keyof RecordsQuery]),
    );
  return parsed.success
    ? {
        query: parsed.data,
        reuse:
          inherited &&
          sameSelection &&
          (query.operation !== "compare" || previous?.operation === "compare"),
      }
    : {
        clarification:
          "That date range is invalid. Use real dates in YYYY-MM-DD order, start before end.",
      };
}
