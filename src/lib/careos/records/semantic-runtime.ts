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
  conversationModelPlanSchema,
  CONVERSATION_MODEL_PROMPT,
} from "./conversation-service";
import { getKnowledge } from "../knowledge-repository";
import { ownedFollowupHistory } from "./followup";
import { getCareFeed } from "../../care/repository";
import { StandingOwner } from "../standing-owner";
import { hostedDemo } from "../../hosted-demo";
import { ResponsesProvider, type ModelResult } from "../providers/responses";
import { accountedCall } from "../accounted-call";

export async function assertRecordsModelAccess() {
  const { config } = careRuntime();
  // Private subscription or explicitly configured controlled Render API only.
  // A public records cookie or memory store never grants model authority.
  if (
    (config.mode !== "subscription" &&
      !(config.mode === "responses" && hostedDemo(process.env))) ||
    !(recordsRuntime().store instanceof PostgresStore)
  )
    throw new CareError("careos_live_not_authorized", 403);
  await assertCustomerRuntimeAccess(config, "records");
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
  if (hostedDemo(process.env)) {
    const { config } = careRuntime();
    if (config.mode !== "responses" || !(store instanceof PostgresStore))
      throw new CareError("careos_live_not_authorized", 403);
    const model = new ResponsesProvider(config);
    const timeout = AbortSignal.any([
      signal,
      AbortSignal.timeout(TURN_DEADLINE_MS),
    ]);
    const call = async <T>(
      work: (signal: AbortSignal) => Promise<ModelResult<T>>,
    ) => {
      await assertRecordsModelAccess();
      timeout.throwIfAborted();
      const reservation = await store.reserve(id, owner, input.requestId);
      return accountedCall(
        () => work(timeout),
        (micro, usage) =>
          store.settle(id, owner, input.requestId, reservation, micro, usage),
      );
    };
    return answerConversationTurn({
      input,
      history,
      load: getSavedRecordsData,
      loadSelected: getDemoData,
      knowledge: getKnowledge,
      care: getCareFeed,
      model,
      call,
      interpret: (payload) =>
        call((s) =>
          model.structured(
            payload,
            conversationModelPlanSchema,
            "north_conversation_v1",
            s,
            CONVERSATION_MODEL_PROMPT,
          ),
        ),
    });
  }
  const ownerProof = standingOwnerMode()
    ? await assertStandingOwner("records")
    : undefined;
  const campaignOwner = ownerProof ? new StandingOwner() : undefined;
  const held =
    ownerProof && campaignOwner
      ? await campaignOwner.beginCampaignQuestion(
          ownerProof,
          input.requestId,
          id,
          process.env.CAREOS_STANDING_AI_ENABLED === "true",
        )
      : false;
  try {
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
      return await answerConversationTurn({
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
              conversationModelPlanSchema,
              "north_conversation_v1",
              timeout,
              CONVERSATION_MODEL_PROMPT,
            )
          ).value;
        },
      });
    return await answerSemanticRecordsTurn({
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
  } finally {
    if (held && ownerProof && campaignOwner)
      await campaignOwner.finishCampaignQuestion(
        ownerProof,
        input.requestId,
        id,
      );
  }
}
