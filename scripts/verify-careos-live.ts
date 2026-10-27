import { randomUUID, randomBytes } from "node:crypto";
import { parseCareConfig } from "../src/lib/careos/config";
import { assertEvaluationAccess } from "../src/lib/careos/evaluation-access";
import { validateDashboardPlan } from "../src/lib/intelligence/commands";
import "./environment";
// Fixed owner-run acceptance, never executed by CI. No retries, cleanup, PayPal
// requests or changes to financial records. No credentials/content printed.
if (
  process.argv[2] !== "--run" ||
  process.env.CAREOS_LIVE_TEST_APPROVED !== "true"
)
  throw new Error("Separate approval plus --run required; no requests sent.");
const config = parseCareConfig(process.env),
  origin = process.env.APP_ORIGIN;
if (
  config.mode !== "responses" ||
  config.dailyMicro > 500000 ||
  !origin ||
  !URL.canParse(origin) ||
  !["localhost", "127.0.0.1"].includes(new URL(origin).hostname)
)
  throw new Error(
    "Requires approved local Responses runtime with daily cap at most $0.50.",
  );
const customer = process.env.CAREOS_CUSTOMER_ACCESS_TOKEN,
  studio = process.env.CAREOS_STUDIO_ACCESS_TOKEN;
assertEvaluationAccess("customer", customer, process.env);
assertEvaluationAccess("studio", studio, process.env);
const token = randomBytes(32).toString("hex");
const customerCookie = `palcare-ai-customer=${customer}; palcare-careos=${token}`;
const studioCookie = `palcare-ai-studio=${studio}`;
const request = async (path: string, cookie: string, body?: unknown) => {
  const r = await fetch(origin + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Origin: origin,
      "Content-Type": "application/json",
      Cookie: cookie,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(55000),
    redirect: "error",
  });
  if (!r.ok) throw new Error("Acceptance request failed; stop without retry");
  return r.json();
};
try {
  const ready = await request("/api/ready", "");
  if (
    ready.source !== "database" ||
    ready.features.careos !== "responses" ||
    ready.features.checkout !== "disabled" ||
    ready.features.guardian !== "disabled" ||
    ready.features.discovery !== "fixture"
  )
    throw new Error("Unsafe readiness state");
  const c = await request("/api/careos/conversations", customerCookie, {});
  const care = (message: string, intent?: string) =>
    request(`/api/careos/conversations/${c.id}/turns`, customerCookie, {
      requestId: randomUUID(),
      twinId: "00000000-0000-4000-8000-000000000204",
      revision: 1,
      message,
      ...(intent ? { intent } : {}),
    });
  const receipt = await care("Find receipt", "receipt");
  if (receipt.answer.mode !== "deterministic")
    throw new Error("Receipt should not spend model credits");
  const start = Date.now(),
    first = await care(
      "How do I shut down Raspberry Pi 5 running Raspberry Pi OS safely?",
      "care",
    );
  if (
    first.answer.mode !== "live" ||
    first.answer.outcome !== "answered" ||
    !first.answer.sources.length
  )
    throw new Error("Grounded care result missing");
  const follow = await care("Before I unplug it, what do I do?");
  if (follow.answer.mode !== "live" || follow.answer.outcome !== "answered")
    throw new Error("Contextual follow-up failed");
  const s = await request("/api/intelligence/plan", studioCookie, {
    action: "start",
  });
  const plan = validateDashboardPlan(
    await request("/api/intelligence/plan", studioCookie, {
      action: "plan",
      conversationId: s.id,
      requestId: randomUUID(),
      message:
        "Show pending adjustments and add a separate verified-refund summary with its evidence",
      mode: "illustrative",
    }),
  );
  if (plan.outcome !== "apply") throw new Error("Presentation plan missing");
  console.log(
    JSON.stringify(
      {
        status: "PASS mechanical live protocol",
        model: config.model,
        reasoning: "medium",
        maxModelCallsThisScript: 4,
        conservativeRequestCeilingUSD: 0.48,
        elapsedMs: Date.now() - start,
        financialCalls: 0,
        cleanup: false,
        note: "Human grounding and actual Studio UI execution still required. Review private server usage ledger before accepting quality or spend. Disable evaluation after this run; no automatic retries.",
      },
      null,
      2,
    ),
  );
} catch {
  console.error(
    "STOP: controlled live acceptance failed. Do not retry automatically or rotate budget/request IDs to bypass an unknown result. Inspect private evidence/usage; disable live evaluation.",
  );
  process.exitCode = 2;
}
