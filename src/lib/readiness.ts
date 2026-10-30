import "server-only";
import { runtimeDatabase } from "../db/runtime";
import { assertDatabaseAuthority, assertEvidenceGuards } from "../db/authority";
import { getEnvironment } from "./config";
import { CUSTOMER_ID, MERCHANT_ID } from "./demo/fixtures";
import { readinessPlan } from "./readiness-plan";
import { subscriptionFiles } from "./careos/subscription/provider";
import { subscriptionSession } from "./careos/subscription/session";
import { persistentPrivatePreview } from "./private-preview";
import { evaluationAccessStatus } from "./careos/evaluation-access";
import { standingOwnerMode } from "./careos/standing-runtime";
const state = globalThis as unknown as {
  readiness?: { key: string; until: number; work: Promise<void> };
};
export async function readiness() {
  const config = getEnvironment(),
    plan = readinessPlan(process.env);
  const persistent = persistentPrivatePreview(process.env);
  if (plan.features.careos === "subscription" && !persistent) {
    const files = subscriptionFiles();
    await files.prepare();
    await subscriptionSession(files);
    const registration = await files.registration();
    if (
      !registration?.tokens ||
      registration.refreshPending ||
      !registration.tokens.scopes.includes("chatgpt.tokens.use.direct")
    )
      throw new Error("Subscription authorization unavailable");
  }
  // Metadata verification is cached briefly, but connectivity and seed presence
  // are checked every request. No provider calls, write probes, or public diagnostics.
  const key = JSON.stringify(plan.requirements);
  if (
    !state.readiness ||
    state.readiness.key !== key ||
    state.readiness.until < Date.now()
  ) {
    const work = Promise.all(
      plan.requirements.map(async (requirement) => {
        const { pool } = runtimeDatabase(requirement.url, {
          readOnly: requirement.capability === "reader",
        });
        await assertDatabaseAuthority(pool, requirement.capability);
        if (
          requirement.capability === "careos" &&
          plan.features.careos === "responses"
        ) {
          await pool.query("select usage from care_model_calls limit 0");
          const bounds = await pool.query(
            "select pg_get_constraintdef(oid) definition from pg_constraint where conrelid='public.care_model_calls'::regclass and conname='care_call_bounds' and convalidated",
          );
          if (!bounds.rows[0]?.definition.includes("120000"))
            throw new Error("Sol reservation migration required");
        }
        if (requirement.capability === "reader")
          await assertEvidenceGuards(pool);
      }),
    ).then(() => {});
    state.readiness = { key, until: Date.now() + 30000, work };
    void work.catch(() => {
      if (state.readiness?.work === work) state.readiness = undefined;
    });
  }
  await state.readiness.work;
  if (config.dataSource === "database") {
    const { pool } = runtimeDatabase(config.databaseUrl!, { readOnly: true });
    const seed = await pool.query(
      "select exists(select 1 from demo_customers where id=$1) and exists(select 1 from merchants where id=$2) ready",
      [CUSTOMER_ID, MERCHANT_ID],
    );
    if (!seed.rows[0].ready)
      throw new Error("Required demo records unavailable");
  }
  return {
    status: "ready",
    source: config.dataSource,
    records: "demo",
    features: plan.features,
    ...(persistent
      ? {
          aiAuthorization: standingOwnerMode()
            ? "standing-policy-controlled"
            : evaluationAccessStatus({}, process.env).window,
        }
      : {}),
  };
}

export async function boundedReadiness() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      readiness(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Readiness deadline")), 3000);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
