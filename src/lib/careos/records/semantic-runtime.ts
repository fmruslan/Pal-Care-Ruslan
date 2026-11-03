import "server-only";
import { CareError, type TurnInput } from "../contracts";
import { careRuntime, assertCustomerRuntimeAccess } from "../runtime";
import { PostgresStore } from "../postgres-store";
import { assertStandingOwner, standingOwnerMode } from "../standing-runtime";
import { SubscriptionProvider } from "../subscription/provider";
import { TURN_DEADLINE_MS } from "../model-policy";
import { getSavedRecordsData } from "../../demo/repository";
import { recordsRuntime } from "./runtime";
import { answerSemanticRecordsTurn } from "./semantic-service";
import {
  RECORDS_INTERPRETATION_INSTRUCTIONS,
  RECORDS_INTERPRETATION_DEFAULTS,
  recordsInterpretationSchema,
  RECORDS_INTERPRETATION_VERSION,
} from "./interpretation";

export async function assertRecordsModelAccess() {
  const { config } = careRuntime();
  // This increment supports only the existing authorized subscription transport.
  // It cannot activate the separately gated paid API mode or a memory-store model.
  if (
    config.mode !== "subscription" ||
    !(recordsRuntime().store instanceof PostgresStore)
  )
    throw new CareError("careos_live_not_authorized", 403);
  await assertCustomerRuntimeAccess(config);
}
export async function answerAuthorizedRecords(
  input: TurnInput,
  id: string,
  owner: string,
  signal: AbortSignal,
) {
  await assertRecordsModelAccess();
  const { store } = recordsRuntime();
  const ownerProof = standingOwnerMode()
    ? await assertStandingOwner()
    : undefined;
  const provider = new SubscriptionProvider({
    scope: "customer",
    requestId: input.requestId,
    ownerProof,
  });
  const timeout = AbortSignal.any([
    signal,
    AbortSignal.timeout(TURN_DEADLINE_MS),
  ]);
  const history = (await store.get(id, owner)).turns;
  return answerSemanticRecordsTurn({
    input,
    history,
    load: getSavedRecordsData,
    interpret: async (payload) => {
      await assertRecordsModelAccess();
      timeout.throwIfAborted();
      // Existing production transport reserves before POST and preserves every
      // failed/unknown attempt. One structured proposal; no open-ended tool loop.
      return (
        await provider.structured(
          payload,
          recordsInterpretationSchema,
          RECORDS_INTERPRETATION_VERSION.replaceAll("-", "_"),
          timeout,
          `${RECORDS_INTERPRETATION_INSTRUCTIONS}\n${RECORDS_INTERPRETATION_DEFAULTS}`,
        )
      ).value;
    },
  });
}
