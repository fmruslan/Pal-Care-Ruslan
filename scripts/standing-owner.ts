import { StandingOwner } from "../src/lib/careos/standing-owner";
import { createHash } from "node:crypto";
import { subscriptionFiles } from "../src/lib/careos/subscription/provider";

// Host-only administration. No credential refresh, model call or network work.
const [action, id, ...extra] = process.argv.slice(2);
try {
  if (
    extra.length ||
    !id ||
    !["approve-browser", "revoke-browser", "approve-policy"].includes(action)
  )
    throw new Error("usage");
  const owner = new StandingOwner();
  if (action === "approve-browser") await owner.approve(id);
  else if (action === "revoke-browser") await owner.revokeSession(id);
  else {
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
    action === "approve-policy"
      ? "Exact standing policy stored. Runtime activation and provider credentials unchanged."
      : "Browser access updated. AI permission and provider credentials unchanged.",
  );
} catch {
  console.error(
    "Owner operation denied. Check the exact browser request ID and protected storage; no automatic recovery performed.",
  );
  process.exitCode = 1;
}
