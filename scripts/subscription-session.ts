import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { PilotFiles } from "../src/lib/careos/subscription/files";
import {
  authorizeSession,
  extendSessionTo50,
  subscriptionStructured,
} from "../src/lib/careos/subscription/session";
import { classificationSchema } from "../src/lib/careos/providers/responses";
import { safeFailure } from "../src/lib/careos/subscription/pilot";

const files = new PilotFiles(join(homedir(), ".config/palcare-chatgpt-pilot"));
try {
  if (
    process.argv[2] === "authorize" &&
    process.argv[3] === "--credits-disabled"
  ) {
    await files.locked(() => authorizeSession(files));
    console.log(
      "Authorized the owner-approved 30 additional subscription requests for 24 hours; original pilot untouched.",
    );
  } else if (
    process.argv[2] === "extend-to-50" &&
    process.argv[3] === "--credits-disabled"
  ) {
    await files.locked(() => extendSessionTo50(files));
    console.log(
      "Owner-approved session cap is now 50 total; existing attempts, expiry and provider blocks unchanged.",
    );
  } else if (process.argv[2] === "diagnose") {
    const result = await subscriptionStructured({
      files,
      scope: "diagnostic",
      requestId: randomUUID(),
      payload: JSON.stringify({
        task: "classify",
        question: "How do I shut down my Raspberry Pi 5 safely?",
        product: { brand: "Raspberry Pi", model: "5" },
        history: [],
      }),
      schema: classificationSchema,
      name: "careos_intent",
      signal: AbortSignal.timeout(22000),
    });
    console.log(JSON.stringify({ status: "PASS", value: result.value }));
  } else if (process.argv[2] === "status") {
    await files.locked(async () => {
      const s = (await files.read("session.json")) as {
        attempts: {
          schema: string;
          state: string;
          error?: string;
          summary: Record<string, unknown>;
        }[];
        blocked: string | null;
      };
      console.log(
        JSON.stringify(
          {
            requests: s?.attempts?.length ?? 0,
            blocked: s?.blocked ?? null,
            attempts: s?.attempts?.map((a) => ({
              schema: a.schema,
              state: a.state,
              error: a.error,
              summary: Object.fromEntries(
                Object.entries(a.summary).filter(
                  ([key]) => key !== "requestId",
                ),
              ),
            })),
          },
          null,
          2,
        ),
      );
    });
  } else throw new Error("Unknown command");
} catch (error) {
  console.error(safeFailure(error));
  process.exitCode = 2;
}
