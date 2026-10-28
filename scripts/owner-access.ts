import { homedir } from "node:os";
import { join } from "node:path";
import {
  approveOwnerAccess,
  pairingScopes,
} from "../src/lib/careos/owner-access";
import { PilotFiles } from "../src/lib/careos/subscription/files";

// Execute as the existing owner account over authenticated SSH. A request ID is
// not a bearer credential; completion also requires that browser's HttpOnly nonce.
try {
  const [action, id, flag, list, ...extra] = process.argv.slice(2);
  if (action !== "approve" || flag !== "--scopes" || extra.length)
    throw new Error("Usage");
  const scopes = pairingScopes.parse(list?.split(","));
  const approved = await approveOwnerAccess(
    new PilotFiles(join(homedir(), ".config/palcare-chatgpt-pilot")),
    id,
    scopes,
  );
  console.log(
    `Approved ${approved.scopes.join(" + ")} for this browser request. Return to that browser and choose Finish owner connection before ${approved.expiresAt}. Its scope cookies will use the existing testing-window deadline; the window and request allowance are unchanged.`,
  );
} catch {
  console.error(
    "Not approved. Use the command from your own current browser request, with its exact scopes, during an active approved window. No renewal or model call was made.",
  );
  process.exitCode = 2;
}
