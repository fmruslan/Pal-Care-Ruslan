import { StandingOwner } from "../src/lib/careos/standing-owner";
import { createHash } from "node:crypto";
import { subscriptionFiles } from "../src/lib/careos/subscription/provider";

// Host-only administration. No credential refresh, model call or network work.
const [action, id, ...extra] = process.argv.slice(2);
try {
  if (
    extra.length ||
    !id ||
    ![
      "approve-browser",
      "revoke-browser",
      "approve-policy",
      "approve-evaluation",
      "approve-review-origin",
      "approve-quota-campaign",
    ].includes(action)
  )
    throw new Error("usage");
  const owner = new StandingOwner();
  if (action === "approve-quota-campaign") {
    if (id !== "quota-campaign-approval.json") throw new Error("usage");
    await owner.installQuotaCampaign(
      await owner.files.read("quota-campaign-approval.json"),
    );
  } else if (action === "approve-browser") await owner.approve(id);
  else if (action === "approve-evaluation") {
    if (id !== "evaluation-approval.json") throw new Error("usage");
    await owner.approveEvaluation(
      await owner.files.read("evaluation-approval.json"),
    );
  } else if (action === "revoke-browser") await owner.revokeSession(id);
  else if (action === "approve-review-origin") {
    if (id !== "north-review-origin-approval.json") throw new Error("usage");
    await owner.installReviewOriginApproval(
      await owner.files.read("north-review-origin-request.json"),
    );
  } else {
    // The argument must name the one protected approval file, not arbitrary
    // browser input. Installing authority requires a separate exact approval.
    if (id !== "standing-approval.json") throw new Error("usage");
    const value = await owner.files.read("standing-approval.json");
    const history = await subscriptionFiles().read("session.json");
    const { standingPolicySchema } =
      await import("../src/lib/careos/standing-owner");
    const policy = standingPolicySchema.parse(value);
    if (
      !history ||
      policy.historicalJournalHash !==
        createHash("sha256").update(JSON.stringify(history)).digest("hex")
    )
      throw new Error("history mismatch");
    await owner.installPolicy(policy);
  }
  console.log(
    action === "approve-quota-campaign"
      ? "Quota-bounded campaign policy stored without a calendar deadline. Historical grants/usage unchanged; normal browser approval and provider checks remain required."
      : action === "approve-review-origin"
        ? "Exact review origin approved against the existing policy. No allowance, session or expiry was reset."
        : action === "approve-policy"
          ? "Exact standing policy stored. Runtime activation and provider credentials unchanged."
          : "Browser access updated. AI permission and provider credentials unchanged.",
  );
} catch {
  console.error(
    "Owner operation denied. Check the exact browser request ID and protected storage; no automatic recovery performed.",
  );
  process.exitCode = 1;
}
