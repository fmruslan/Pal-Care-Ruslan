import "server-only";
import { cookies } from "next/headers";
import { MemoryStore, type ConversationStore } from "./store";
import { CareError, type TurnInput } from "./contracts";
import { getCareData } from "../demo/repository";
import { getKnowledge } from "./knowledge-repository";
import { getEnvironment } from "../config";
import { runtimeDatabase as createDatabase } from "../../db/runtime";
import { validAppOrigin } from "../origin";
import { runtimeWriterUrl } from "../../db/authority";
import { PostgresStore } from "./postgres-store";
import { parseCareConfig } from "./config";
import { ResponsesProvider, type ModelResult } from "./providers/responses";
import { resolveTurn } from "./service";
import { getGuardian } from "../price-guardian/runtime";
import { getSafety } from "../safety/runtime";
import { getPurchaseActivity } from "./activity-repository";
import { SOL_RESERVATION_MICRO, TURN_DEADLINE_MS } from "./model-policy";
import {
  assertEvaluationAccess,
  evaluationCookie,
  evaluationSettings,
} from "./evaluation-access";
import { accountedCall } from "./accounted-call";
import { SubscriptionProvider } from "./subscription/provider";
import { assertStandingOwner, standingOwnerMode } from "./standing-runtime";

const state = globalThis as unknown as {
  careosMemory?: MemoryStore;
  careosPostgres?: PostgresStore;
};
export function careRuntime() {
  const origin = process.env.APP_ORIGIN;
  if (!validAppOrigin(origin))
    throw new CareError("careos_origin_not_configured");
  const environment = getEnvironment();
  const config = parseCareConfig(process.env);
  if (
    (config.mode === "responses" || config.mode === "subscription") &&
    !standingOwnerMode()
  )
    evaluationSettings(process.env);
  let store: ConversationStore;
  if (environment.dataSource === "database") {
    state.careosPostgres ??= new PostgresStore(
      createDatabase(runtimeWriterUrl("CAREOS_DATABASE_URL")).pool,
      config.mode === "responses"
        ? {
            dailyMicro: config.dailyMicro,
            totalMicro: config.totalMicro,
            budgetId: config.budgetId,
            reservationMicro: SOL_RESERVATION_MICRO,
          }
        : undefined,
      true,
    );
    store = state.careosPostgres;
  } else store = state.careosMemory ??= new MemoryStore();
  return { store, origin, config };
}

export async function assertCustomerRuntimeAccess(
  config: ReturnType<typeof parseCareConfig>,
) {
  if (config.mode === "subscription" && standingOwnerMode()) {
    await assertStandingOwner();
    return;
  }
  if (config.mode === "subscription")
    assertEvaluationAccess(
      "customer",
      (await cookies()).get(evaluationCookie("customer"))?.value,
      process.env,
    );
}

export async function answerTurn(
  input: TurnInput,
  conversationId: string,
  owner: string,
  signal?: AbortSignal,
) {
  const { store, config } = careRuntime();
  await assertCustomerRuntimeAccess(config);
  const ownerProof =
    config.mode === "subscription" && standingOwnerMode()
      ? await assertStandingOwner()
      : undefined;
  const deadline = Date.now() + TURN_DEADLINE_MS;
  const [data, conversation] = await Promise.all([
    getCareData(input.twinId),
    store.get(conversationId, owner),
  ]);
  const model =
    config.mode === "responses"
      ? new ResponsesProvider(config)
      : config.mode === "subscription"
        ? new SubscriptionProvider({
            scope: "customer",
            requestId: input.requestId,
            ownerProof,
          })
        : undefined;
  let calls = 0;
  const call = async <T>(
    work: (signal: AbortSignal) => Promise<ModelResult<T>>,
  ): Promise<T> => {
    if (
      !(store instanceof PostgresStore) ||
      !["responses", "subscription"].includes(config.mode)
    )
      throw new CareError("careos_live_not_authorized");
    if (ownerProof) await assertStandingOwner();
    else
      assertEvaluationAccess(
        "customer",
        (await cookies()).get(evaluationCookie("customer"))?.value,
        process.env,
      );
    if (Date.now() >= deadline) throw new CareError("careos_deadline");
    if (++calls > 2) throw new CareError("careos_call_limit");
    if (config.mode === "subscription") {
      const timeout = AbortSignal.timeout(Math.max(1, deadline - Date.now()));
      return (await work(signal ? AbortSignal.any([signal, timeout]) : timeout))
        .value;
    }
    const reservation = await store.reserve(
      conversationId,
      owner,
      input.requestId,
    );
    // Reservation remains charged on timeout/unknown outcome. Never auto-retry.
    const timeout = AbortSignal.timeout(Math.max(1, deadline - Date.now()));
    return accountedCall(
      () => work(signal ? AbortSignal.any([signal, timeout]) : timeout),
      (micro, usage) =>
        store.settle(
          conversationId,
          owner,
          input.requestId,
          reservation,
          micro,
          usage,
        ),
    );
  };
  return resolveTurn({
    data,
    input,
    sources: [],
    history: conversation.turns,
    mode: config.mode === "subscription" ? "responses" : config.mode,
    model,
    call,
    load: {
      knowledge: getKnowledge,
      activity: () => getPurchaseActivity(data, input.twinId ?? undefined),
      guardian: async () =>
        (await getGuardian(input.twinId ?? undefined)).cases,
      recall: async () => {
        const safety = await getSafety();
        return {
          hash: safety.snapshot.hash,
          title: safety.snapshot.source.Title,
          url: safety.snapshot.source.URL,
          retrievedAt: safety.snapshot.retrievedAt,
          mode: safety.mode,
          unavailable: safety.unavailable,
        };
      },
    },
  });
}
