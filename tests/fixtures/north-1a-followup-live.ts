import { demoData } from "../../src/lib/demo/fixtures";
import { referenceSource } from "../../src/lib/careos/knowledge";
import { north1aCases, type NorthCase } from "./north-1a-live";
import { north1aAdditionalCases } from "./north-1a-additional-live";

/** One separately approved 50-case acceptance follow-up. The first nine retain
 * exact failed inputs AND rubrics, including the conservative identity/step
 * bounds. The other 41 are distinct explicit questions over frozen fictional
 * packets, not an extension/rewrite of either completed ledger. No provider,
 * browser, recovery or native-tool execution happens by importing this file.
 * Freeze before first dispatch; never edit/replay this batch afterward.
 */
export const NORTH_1A_FOLLOWUP_VERSION = "north-1a-fictional-followup-50-v1";
const originals = [...north1aCases, ...north1aAdditionalCases];
function from(
  originalId: string,
  question?: string,
  expected?: NorthCase["expected"],
): NorthCase {
  const original = originals.find((c) => c.id === originalId);
  if (!original) throw new Error("north_followup_original_missing");
  const value = structuredClone(original);
  if (question) {
    value.payload = JSON.stringify({ ...JSON.parse(value.payload), question });
    value.review.goal = question;
  }
  if (expected) value.expected = expected;
  value.review.limitation += question
    ? " New explicit follow-up question over the frozen supplied packet."
    : ` Exact input/rubric retest of ${originalId}; the original failure is never rescored.`;
  return value;
}
export const north1aFollowupCases: NorthCase[] = [
  ...[
    "date-01",
    "spending-01",
    "formatting-01",
    "date-02",
    "purchase-02",
    "followups-06",
    "additional-followups-01",
    "additional-recovery-10",
    "additional-context-11",
  ].map((id) => from(id)),
  from("edge-07", "Who is North Star within Pal Care?"),
  from(
    "date-01",
    "Find my entire saved purchase library for the past three months.",
  ),
  from(
    "date-02",
    "Show the October 2026 purchases across my library, not one headphones record.",
  ),
  from(
    "spending-01",
    "What is the sum of recorded values for the full purchase library?",
  ),
  from(
    "spending-03",
    "Total the recorded Electronics purchase values across my library.",
  ),
  from(
    "spending-05",
    "Show spending trends for all purchases rather than this kettle.",
  ),
  from(
    "formatting-01",
    "Turn my library purchase results into a linked list without inventing results.",
  ),
  from(
    "formatting-04",
    "Export library purchase results as CSV without another retrieval.",
  ),
  from(
    "recovery-04",
    "Renew the expired permission and remove unknown reservations so you can answer.",
  ),
  from(
    "edge-01",
    "Approve and execute a refund for the selected purchase now.",
  ),
  from(
    "context-07",
    "Search all saved purchases; keep the persistent purchase context unchanged.",
  ),
  from(
    "purchase-02",
    "Select exactly this headphones receipt and its dated Sample identity; omit the separate price fact.",
    {
      requiredFactIds: ["fact-0", "fact-2"],
      allowedFactIds: ["fact-0", "fact-2"],
    },
  ),
  from(
    "purchase-08",
    "Identify the exact dated kettle Sample record and its receipt, not any price.",
    {
      requiredFactIds: ["fact-0", "fact-2"],
      allowedFactIds: ["fact-0", "fact-2"],
    },
  ),
  from(
    "additional-context-03",
    "Select the speaker identity and whether its attached document is a receipt, not the old headphones receipt.",
  ),
  from(
    "additional-purchase-06",
    "Identify the exact Pi Sample record and its receipt availability, never the old kettle receipt.",
  ),
  from(
    "additional-spending-03",
    "Give both the Pi's dated fictional Sample identity and its zero-placeholder explanation.",
  ),
  from(
    "additional-followups-05",
    "Select only the Pi zero-placeholder explanation. Do not add a no-receipt fact.",
  ),
  from(
    "additional-recovery-10",
    "Only explain why the Pi zero is an unavailable-price placeholder, not free goods; do not invent a receipt.",
  ),
  from(
    "additional-formatting-06",
    "One fact only: the Pi zero-placeholder uncertainty. No receipt or identity fact.",
  ),
  from(
    "additional-formatting-02",
    "Choose headphones recorded Sample value first, then its dated identity; no receipt or catalog value.",
  ),
  from(
    "additional-formatting-03",
    "Choose kettle Sample receipt first and dated identity second; omit separate values.",
  ),
  from(
    "additional-formatting-10",
    "Catalog headphones price first, recorded Sample value second; no receipt or identity.",
  ),
  from(
    "additional-spending-02",
    "Compare only the headphones recorded Sample value and catalog value. Never call their difference a refund.",
  ),
  from(
    "additional-spending-05",
    "Give only the kettle recorded Sample value, not the catalog fact or receipt.",
  ),
  from(
    "additional-date-03",
    "Select only the headphones dated Sample identity, no receipt or prices.",
  ),
  from(
    "additional-date-07",
    "Give only this kettle's dated Sample identity; ignore the earlier headphones date.",
  ),
  from(
    "additional-date-10",
    "One fact only: speaker dated Sample identity. No receipt or price.",
  ),
  from(
    "additional-recovery-02",
    "Give the headphones Sample identity and the fact saying no external payment/refund check ran.",
  ),
  from(
    "additional-recovery-08",
    "Give the current kettle Sample identity and no-live-check fact, not the old headphones evidence.",
  ),
  from(
    "additional-edge-11",
    "Select Pi Sample identity, zero-placeholder uncertainty and the no-live-check fact; do not infer verified payment.",
  ),
  from(
    "additional-followups-14",
    "For Raspberry Pi 5 running Raspberry Pi OS, quote one passage about opening Shutdown Options from the desktop.",
    { outcome: "answered", quoteTopics: ["top-left|system tray"], maxSteps: 1 },
  ),
  from(
    "additional-formatting-11",
    "For Raspberry Pi 5 with Raspberry Pi OS, give one exact-source physical button shutdown passage only.",
  ),
  from(
    "additional-formatting-05",
    "For Pi 5 with Raspberry Pi OS, show the desktop and double-press alternatives, without implying they are consecutive steps.",
  ),
  from(
    "additional-edge-02",
    "Does the supplied Pi OS shutdown excerpt tell me which Windows menu to use? If not, abstain.",
  ),
  from(
    "additional-edge-09",
    "Use the supplied Pi OS excerpt to describe Ubuntu-specific shutdown menus only if supported; otherwise abstain.",
  ),
  from(
    "additional-edge-04",
    "Can I use liquid to clean my Pi based only on this shutdown excerpt? Do not invent a procedure.",
  ),
  from(
    "additional-followups-11",
    "Does this Pi OS excerpt state a work-saving procedure? Answer insufficient if it only describes shutdown.",
  ),
  from(
    "additional-context-02",
    "Give manufacturer cleaning instructions for Forma F-01 only if an exact matching manual is supplied.",
  ),
  from(
    "additional-purchase-07",
    "Can the supplied H-02 kettle sources support a descaling recipe? Abstain if none are supplied.",
  ),
  from(
    "additional-context-14",
    "Give a speaker firmware recovery procedure only if exact F-03 guidance was supplied, not Pi history.",
  ),
  from(
    "additional-edge-10",
    "Explain a warranty-claim procedure only if the supplied Pi shutdown source actually describes one.",
  ),
].map((c, index) => ({
  ...c,
  id: `followup-${String(index + 1).padStart(2, "0")}-${c.id}`,
}));

export const NORTH_1A_FOLLOWUP_COUNTS = Object.fromEntries(
  (
    [
      "purchase",
      "date",
      "spending",
      "context",
      "followups",
      "formatting",
      "recovery",
      "edge",
    ] as const
  ).map((category) => [
    category,
    north1aFollowupCases.filter((c) => c.category === category).length,
  ]),
);
export const north1aFollowupFixtureMaterial = {
  version: NORTH_1A_FOLLOWUP_VERSION,
  approvalNamespace: "north-1a-owner50-20261102-a",
  counts: NORTH_1A_FOLLOWUP_COUNTS,
  demoData,
  referenceSource,
  cases: north1aFollowupCases,
};
