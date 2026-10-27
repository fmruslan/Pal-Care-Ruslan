import { cookies } from "next/headers";
import { z } from "zod";
import { careRuntime } from "@/lib/careos/runtime";
import {
  assertOrigin,
  readJson,
  careError,
  careResponse,
  digest,
} from "@/lib/careos/security";
import {
  assertEvaluationAccess,
  evaluationCookie,
} from "@/lib/careos/evaluation-access";
import { CareError } from "@/lib/careos/contracts";
import { PostgresStore } from "@/lib/careos/postgres-store";
import { ResponsesProvider } from "@/lib/careos/providers/responses";
import { accountedCall } from "@/lib/careos/accounted-call";
import { getGuardian } from "@/lib/price-guardian/runtime";
import { illustrativeDataset, recordedDataset } from "@/lib/intelligence/model";
import {
  planDashboard,
  validateDashboardPlan,
  savedPresentation,
  unavailablePresentationTurn,
} from "@/lib/intelligence/planner";
import { presentationRequestAllowed } from "@/lib/intelligence/commands";
import { studioEvaluationAllowed } from "@/lib/intelligence/access";
import { MODEL_TIMEOUT_MS } from "@/lib/careos/model-policy";
import { SubscriptionProvider } from "@/lib/careos/subscription/provider";
const schema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("start") }),
  z.strictObject({
    action: z.literal("plan"),
    conversationId: z.uuid(),
    requestId: z.uuid(),
    message: z.string().min(1).max(500),
    mode: z.enum(["recorded", "illustrative"]),
  }),
]);
export async function POST(request: Request) {
  try {
    const { store, origin, config } = careRuntime();
    assertOrigin(request, origin);
    if (
      !["responses", "subscription"].includes(config.mode) ||
      !(store instanceof PostgresStore) ||
      !studioEvaluationAllowed(process.env, request.headers.get("host") ?? "")
    )
      throw new CareError("studio_live_unavailable");
    const token = (await cookies()).get(evaluationCookie("studio"))?.value;
    assertEvaluationAccess("studio", token, process.env);
    const owner = digest(`studio:${token}`),
      body = schema.parse(await readJson(request));
    if (body.action === "start")
      return careResponse(await store.create(owner), 201);
    if (!presentationRequestAllowed(body.message))
      return careResponse({ outcome: "unsupported", commands: [] });
    const input = {
      requestId: body.requestId,
      twinId: null,
      revision: 0,
      message: JSON.stringify({
        scope: "studio",
        message: body.message,
        mode: body.mode,
      }),
    };
    const prior = await store.claim(body.conversationId, owner, input);
    if (prior) return careResponse(savedPresentation(prior));
    try {
      const signal = AbortSignal.any([
        request.signal,
        AbortSignal.timeout(MODEL_TIMEOUT_MS),
      ]);
      const data =
        body.mode === "illustrative"
          ? illustrativeDataset
          : recordedDataset(await getGuardian());
      if (signal.aborted) throw new CareError("studio_cancelled");
      const subscription = config.mode === "subscription";
      const reservation = !subscription
        ? await store.reserve(body.conversationId, owner, body.requestId)
        : null;
      const work = () =>
        planDashboard(
          config.mode === "responses"
            ? new ResponsesProvider(config)
            : new SubscriptionProvider({
                scope: "studio",
                requestId: body.requestId,
              }),
          body.message,
          data,
          signal,
        );
      const raw = subscription
        ? (await work()).value
        : await accountedCall(
            () => work(),
            (micro, usage) =>
              store.settle(
                body.conversationId,
                owner,
                body.requestId,
                reservation!,
                micro,
                usage,
              ),
          );
      const plan = validateDashboardPlan(raw);
      await store.finish(body.conversationId, owner, {
        requestId: body.requestId,
        message: input.message,
        answer: {
          outcome: plan.outcome === "apply" ? "answered" : "unsupported",
          mode: "live",
          context: null,
          revision: 0,
          text: "Validated presentation-only plan; no financial action.",
          steps: [],
          sources: [],
          actions: [],
          presentation: plan,
        },
      });
      return careResponse(plan);
    } catch (error) {
      // Persist terminal failure and release the conversation lease. The provider
      // reservation/unknown subscription attempt remains consumed, never retried.
      await store.finish(
        body.conversationId,
        owner,
        unavailablePresentationTurn(body.requestId, input.message),
      );
      throw error;
    }
  } catch (e) {
    return careError(e);
  }
}
