import "server-only";
import { MemoryStore, type ConversationStore } from "./store";
import { CareError, type TurnInput } from "./contracts";
import { getDemoData } from "../demo/repository";
import { getKnowledge } from "./knowledge-repository";
import { getEnvironment } from "../config";
import { createDatabase } from "../../db/connection";
import { PostgresStore } from "./postgres-store";
import { parseCareConfig } from "./config";
import { ResponsesProvider, type ModelResult } from "./providers/responses";
import { resolveTurn } from "./service";
import { getGuardian } from "../price-guardian/runtime";

const state = globalThis as unknown as {
  careosMemory?: MemoryStore;
  careosPostgres?: PostgresStore;
};
export function careRuntime() {
  const origin = process.env.APP_ORIGIN;
  if (
    !origin ||
    !URL.canParse(origin) ||
    new URL(origin).origin !== origin ||
    !(
      origin.startsWith("https://") ||
      (origin.startsWith("http://") &&
        ["localhost", "127.0.0.1"].includes(new URL(origin).hostname))
    )
  )
    throw new CareError("careos_origin_not_configured");
  const environment = getEnvironment();
  const config = parseCareConfig(process.env);
  let store: ConversationStore;
  if (environment.dataSource === "database") {
    state.careosPostgres ??= new PostgresStore(
      createDatabase(
        process.env.CAREOS_DATABASE_URL || environment.databaseUrl!,
      ).pool,
      config.mode === "responses"
        ? {
            dailyMicro: config.dailyMicro,
            totalMicro: config.totalMicro,
            budgetId: config.budgetId,
          }
        : undefined,
      config.mode === "responses",
    );
    store = state.careosPostgres;
  } else store = state.careosMemory ??= new MemoryStore();
  return { store, origin, config };
}

export async function answerTurn(
  input: TurnInput,
  conversationId: string,
  owner: string,
) {
  const { store, config } = careRuntime();
  const deadline = Date.now() + 20000;
  const [data, sources, conversation, guardian] = await Promise.all([
    getDemoData(),
    getKnowledge(),
    store.get(conversationId, owner),
    getGuardian(),
  ]);
  const model =
    config.mode === "responses" ? new ResponsesProvider(config) : undefined;
  const call = async <T>(
    work: (signal: AbortSignal) => Promise<ModelResult<T>>,
  ): Promise<T> => {
    if (!(store instanceof PostgresStore) || config.mode !== "responses")
      throw new CareError("careos_live_not_authorized");
    if (Date.now() >= deadline) throw new CareError("careos_deadline");
    const reservation = await store.reserve(
      conversationId,
      owner,
      input.requestId,
    );
    // Reservation remains charged on timeout/unknown outcome. Never auto-retry.
    const result = await work(
      AbortSignal.timeout(Math.max(1, deadline - Date.now())),
    );
    if (result.micro !== null)
      await store.settle(
        conversationId,
        owner,
        input.requestId,
        reservation,
        result.micro,
      );
    return result.value;
  };
  return resolveTurn({
    data,
    input,
    sources,
    history: conversation.turns,
    mode: config.mode,
    model,
    call,
    guardian: guardian.cases,
  });
}
