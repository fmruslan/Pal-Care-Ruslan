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
import { northConversationalPresentation } from "../../private-preview-origin";
import {
  answerConversationTurn,
  conversationPlanSchema,
  CONVERSATION_INSTRUCTIONS,
} from "./conversation-service";
import { getKnowledge } from "../knowledge-repository";
import { ownedFollowupHistory } from "./followup";
import { getCareFeed } from "../../care/repository";

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
  const history = ownedFollowupHistory(
    (await store.get(id, owner)).turns,
    input.followupRequestId,
  );
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
  if (northConversationalPresentation(process.env))
    return answerConversationTurn({
      input,
      history,
      load: getSavedRecordsData,
      knowledge: getKnowledge,
      care: getCareFeed,
      model: provider,
      call: async (work) => (await work(timeout)).value,
      interpret: async (payload) => {
        await assertRecordsModelAccess();
        timeout.throwIfAborted();
        return (
          await provider.structured(
            payload,
            conversationPlanSchema,
            "north_conversation_v1",
            timeout,
            `${CONVERSATION_INSTRUCTIONS}\naftercare: use this read-only task for proactive Care findings, price comparisons/watches, returns or refund progress. productAction is attention, price, returns, refunds, warranty or summary. For prepare-return requests use aftercare/returns: the application offers an editable draft, never sends it. Broad requests have blank productSearch and fresh relation, resolving requested library filters; specific products retain exact dated ownership and disambiguation. These tools share the same evidence as Care cards. The server determines whether saved progress, manual warranty dates or an actually checked watch exists; never assume availability or activity. Manual reports do not establish external verification, warranty coverage or financial status. Keep product actions summary/receipt/documents/manual for the product task.`,
          )
        ).value;
      },
    });
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
