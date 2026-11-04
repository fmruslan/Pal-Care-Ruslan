import "server-only";
import { CareError, type TurnInput } from "../contracts";
import { careRuntime, assertCustomerRuntimeAccess } from "../runtime";
import { PostgresStore } from "../postgres-store";
import { assertStandingOwner, standingOwnerMode } from "../standing-runtime";
import { SubscriptionProvider } from "../subscription/provider";
import { TURN_DEADLINE_MS } from "../model-policy";
import { getDemoData, getSavedRecordsData } from "../../demo/repository";
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
      loadSelected: getDemoData,
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
            `${CONVERSATION_INSTRUCTIONS}\naftercare: use this read-only ownership task for current payment, shipment/delivery, return deadlines/progress, refund evidence, price differences/watches, warranty dates and recall/safety questions. productAction is payment, shipment, delivery, return-window, price-window, returns, refunds, warranty, price, safety, attention or summary. Where is my order/has it arrived uses delivery; can I still return uses returns with the recorded return-window. For an explicit request to OPEN/SHOW/HIGHLIGHT a milestone, select the corresponding open_ action (open_delivery, open_warranty, open_returns, open_return-window, open_price, open_price-window, open_safety, open_refunds, open_purchase or open_watch); this only proposes presentation, not status changes. Do not auto-open for an ordinary factual question. Prepare requests use returns/refunds/warranty/price; the application offers an editable unsent enquiry, never sends it. Broad requests have blank productSearch and fresh relation, resolving requested library filters; specific products retain exact dated ownership/disambiguation. These tools share the timeline and Care evidence, not AI-generated statuses. The server determines actual availability; manual reports do not establish external verification, coverage or financial status. The existing fictional goods do not ship; a merchant-added tracking number would not prove carrier movement/delivery. Recall coverage is limited, never a safety all-clear. Keep product actions summary/receipt/documents/manual for product facts.`,
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
