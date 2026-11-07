/** Isolated synthetic-ledger worker. Never imports provider or runtime code. */
import {
  StandingOwner,
  type OwnerProof,
} from "../../src/lib/careos/standing-owner";
import { PilotFiles } from "../../src/lib/careos/subscription/files";

const [directory, action, requestId, conversationId, token] =
  process.argv.slice(2);
if (!directory?.startsWith("/tmp/opencode/campaign-owner-unit-"))
  throw Error("isolated_test_directory_required");
const owner = new StandingOwner(new PilotFiles(directory));
const proof: OwnerProof = {
  token,
  agent: "synthetic-campaign-browser",
  channel: "records",
};
try {
  if (action === "open")
    await owner.beginCampaignQuestion(proof, requestId, conversationId, true);
  else if (action === "stage-one" || action === "stage-two")
    await owner.reserve(
      proof,
      "customer",
      `customer:${requestId}:${action === "stage-one" ? "north_conversation_v1" : "careos_care"}`,
      true,
    );
  else throw Error("unknown_test_action");
  process.stdout.write(JSON.stringify({ ok: true }));
} catch (error) {
  process.stdout.write(
    JSON.stringify({
      ok: false,
      code: error instanceof Error ? error.message : "denied",
    }),
  );
}
