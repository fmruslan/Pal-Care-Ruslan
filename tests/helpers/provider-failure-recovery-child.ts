/** Explicit isolated cross-process unit-test worker; never production startup. */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  StandingOwner,
  OWNER_ORIGIN,
} from "../../src/lib/careos/standing-owner";
import { PilotFiles } from "../../src/lib/careos/subscription/files";

const [
  directory,
  action,
  epoch,
  token,
  agent,
  recordsOwnerDigest,
  request,
  conversation,
] = process.argv.slice(2);
if (
  !directory ||
  !resolve(directory).startsWith("/tmp/opencode/provider-failure-recovery-") ||
  !["install", "pair", "open", "reserve"].includes(action) ||
  !Number.isSafeInteger(Number(epoch))
)
  throw Error("isolated_provider_recovery_worker_required");
const files = new PilotFiles(directory);
const owner = new StandingOwner(
  files,
  () => Number(epoch),
  undefined,
  async () =>
    JSON.parse(
      await readFile(resolve(directory, "synthetic-environment.json"), "utf8"),
    ),
);
const proof = {
  token,
  agent,
  recordsOwnerDigest,
  origin: OWNER_ORIGIN,
  channel: "records" as const,
};
try {
  if (action === "install")
    await owner.installProviderFailureRecovery(
      await files.read("provider-failure-recovery-approval.json"),
    );
  else if (action === "pair")
    await owner.pair(agent, token, recordsOwnerDigest);
  else if (action === "open")
    await owner.beginCampaignQuestion(proof, request, conversation, true);
  else
    await owner.reserve(
      proof,
      "customer",
      `customer:${request}:${conversation}`,
      true,
    );
  console.log(JSON.stringify({ ok: true }));
} catch (error) {
  console.log(
    JSON.stringify({
      ok: false,
      code:
        error && typeof error === "object" && "code" in error
          ? error.code
          : "denied",
    }),
  );
}
