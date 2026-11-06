import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { standingPolicySchema } from "../src/lib/careos/standing-owner";
import { querySavedRecords } from "../src/lib/careos/records/service";
import { demoData } from "../src/lib/demo/fixtures";
import {
  northFullSlots,
  NORTH_FULL_CAMPAIGN,
} from "../tests/fixtures/north-full-campaign";
import {
  northFullRecordsDrafts,
  NORTH_RECORDS_DRAFT_REFERENCE,
} from "../tests/fixtures/north-full-records-drafts";

/** Read-only preparation. No environment loader, auth, refresh, policy install,
 * inference, browser pairing or run/resume operation exists in this command. */
export function inspectDraftOracles() {
  const slots = new Set(northFullSlots.map((c) => c.id));
  for (const c of northFullRecordsDrafts) {
    const result = querySavedRecords(demoData, c.expectedQuery);
    if (
      !slots.has(c.id) ||
      JSON.stringify(result.records.map((r) => r.id).sort()) !==
        JSON.stringify([...c.expectedIds].sort()) ||
      result.totals[0].amountMinor !== c.expectedSampleMinor ||
      result.totals[0].excludedCount !== c.expectedExcluded ||
      result.records.some(
        (record) =>
          !Object.hasOwn(c.expectedRecordValues, record.id) ||
          record.amountMinor !== c.expectedRecordValues[record.id],
      )
    )
      throw new Error("north_draft_oracle_mismatch");
  }
  return {
    campaign: NORTH_FULL_CAMPAIGN,
    targetCases: 200,
    dispatchesByThisCommand: 0,
    genuineLedgerReviewed: false,
    progressSource:
      "This preparation command does not compute/reset genuine progress; review the campaign ledger separately.",
    registeredSlots: slots.size,
    preparedDrafts: northFullRecordsDrafts.length,
    unpreparedSlots: slots.size - northFullRecordsDrafts.length,
    referenceDate: NORTH_RECORDS_DRAFT_REFERENCE,
    draftManifestHash: createHash("sha256")
      .update(JSON.stringify(northFullRecordsDrafts))
      .digest("hex"),
    frozen: false,
    initialDraftStructuredCalls: 36,
    conservativeDraftAttemptBound: 72,
    authorizationGranted: false,
    liveBrowserHarnessReady: false,
  };
}

const accountingSchema = z.object({
  policy: standingPolicySchema,
  events: z.array(
    z.object({
      kind: z.string(),
      subject: z.string(),
      allocationId: z.string().optional(),
    }),
  ),
  evaluation: z
    .object({ id: z.string(), requestLimit: z.number(), expiresAt: z.number() })
    .optional(),
});
export async function readNorthAccounting() {
  const state = accountingSchema.parse(
    JSON.parse(
      await readFile(
        join(homedir(), ".config/palcare-standing-owner/owner-state.json"),
        "utf8",
      ),
    ),
  );
  const reservations = state.events.filter(
    (e) => e.kind === "reserve" && !e.allocationId,
  );
  const terminal = new Set(
    state.events
      .filter((e) => ["completed", "failed", "unknown"].includes(e.kind))
      .map((e) => e.subject),
  );
  const remaining = Math.max(
    0,
    state.policy.requestLimit - reservations.length,
  );
  return {
    policyId: state.policy.id,
    model: state.policy.model,
    reasoning: state.policy.reasoning,
    totalLimit: state.policy.requestLimit,
    reserved: reservations.length,
    remaining,
    unknown: state.events.filter((e) => e.kind === "unknown").length,
    activeUnsettled: reservations.filter((e) => !terminal.has(e.subject))
      .length,
    providerBlockRecorded: state.events.some(
      (e) => e.kind === "provider-block",
    ),
    policyRevocationRecorded: state.events.some(
      (e) => e.kind === "revoke-policy" && e.subject === state.policy.id,
    ),
    bestCaseAdditionalSlotsForNew200: Math.max(0, 200 - remaining),
    browserProofChecked: false,
    providerEntitlementChecked: false,
    financialCostApproved: false,
    permissionOrExpiryRenewed: false,
    evaluation: state.evaluation
      ? {
          id: state.evaluation.id,
          limit: state.evaluation.requestLimit,
          used: state.events.filter(
            (e) =>
              e.kind === "reserve" && e.allocationId === state.evaluation!.id,
          ).length,
          expiresAt: state.evaluation.expiresAt,
        }
      : null,
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 1 || !["--check", "--accounting"].includes(args[0])) {
    console.log(
      "Read-only: --check validates draft oracles; --accounting reads sanitized existing host usage. No --run/renew/reset operation exists.",
    );
    return;
  }
  try {
    console.log(
      JSON.stringify(
        {
          observedAt: new Date().toISOString(),
          ...(args[0] === "--check"
            ? inspectDraftOracles()
            : await readNorthAccounting()),
        },
        null,
        2,
      ),
    );
  } catch {
    // Never reveal protected file content, parse diagnostics or raw file errors.
    console.error(
      "north_preflight_unavailable_or_invalid; no provider/auth/accounting operation was performed",
    );
    process.exitCode = 1;
  }
}
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url)
  void main();
