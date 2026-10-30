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
import {
  assertStandingOwner,
  standingOwnerMode,
} from "@/lib/careos/standing-runtime";
import { PostgresStore } from "@/lib/careos/postgres-store";
import { ResponsesProvider } from "@/lib/careos/providers/responses";
import { SubscriptionProvider } from "@/lib/careos/subscription/provider";
import { accountedCall } from "@/lib/careos/accounted-call";
import { MODEL_TIMEOUT_MS } from "@/lib/careos/model-policy";
import { studioEvaluationAllowed } from "@/lib/intelligence/access";
import { getCustomerIntelligence } from "@/lib/intelligence/customer-repository";
import {
  customerRequestAllowed,
  type CustomerPlan,
} from "@/lib/intelligence/customer-commands";
import {
  planCustomerDashboard,
  validateCustomerPlan,
  savedCustomerPresentation,
  unavailableCustomerPresentationTurn,
} from "@/lib/intelligence/customer-planner";

const schema = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("start") }),
  z.strictObject({
    action: z.literal("plan"),
    conversationId: z.uuid(),
    requestId: z.uuid(),
    message: z.string().trim().min(1).max(500),
  }),
]);
const conversationQuerySchema = z.strictObject({ conversationId: z.uuid() });

async function customerStudioAccess(request: Request, mutation: boolean) {
  const { store, origin, config } = careRuntime();
  // Browser same-origin GETs need not send Origin. An explicit foreign Origin
  // is never accepted; every mutation still requires the exact trusted Origin.
  if (mutation || request.headers.has("origin")) assertOrigin(request, origin);
  if (
    !["responses", "subscription"].includes(config.mode) ||
    !(store instanceof PostgresStore) ||
    !studioEvaluationAllowed(process.env, request.headers.get("host") ?? "")
  )
    throw new CareError("customer_dashboard_live_unavailable");
  const ownerProof =
    config.mode === "subscription" && standingOwnerMode()
      ? await assertStandingOwner()
      : undefined;
  const token =
    ownerProof?.token ??
    (await cookies()).get(evaluationCookie("studio"))?.value;
  if (!ownerProof) assertEvaluationAccess("studio", token, process.env);
  // Same Studio capability, distinct ownership: neither merchant Studio nor
  // customer CareOS conversations can be read, replayed or claimed here.
  return {
    store,
    config,
    ownerProof,
    owner: digest(`customer-studio:${token}`),
  };
}

function recoveryConversationId(request: Request) {
  const entries = [...new URL(request.url).searchParams.entries()];
  // Do not collapse duplicate keys or accept arbitrary query context/identities.
  const query = conversationQuerySchema.safeParse(Object.fromEntries(entries));
  if (entries.length !== 1 || !query.success)
    throw new CareError("careos_invalid_request", 400);
  return query.data.conversationId;
}

export async function GET(request: Request) {
  try {
    const { store, owner } = await customerStudioAccess(request, false);
    const conversationId = recoveryConversationId(request);
    // Read saved results only. Recovery never claims/retries a request, consumes
    // model quota, executes a plan or implies that browser state was restored.
    return careResponse(await store.get(conversationId, owner));
  } catch (error) {
    return careError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const { store, owner } = await customerStudioAccess(request, true);
    const conversationId = recoveryConversationId(request);
    // Delegate ownership/expiry and pending-lease protection to the existing
    // store. Transcript removal never settles/releases model usage or quotas.
    await store.clear(conversationId, owner);
    return careResponse({ cleared: true });
  } catch (error) {
    return careError(error);
  }
}

export async function POST(request: Request) {
  try {
    const { store, owner, config, ownerProof } = await customerStudioAccess(
      request,
      true,
    );
    const parsed = schema.safeParse(await readJson(request));
    if (!parsed.success) throw new CareError("careos_invalid_request", 400);
    const body = parsed.data;
    if (body.action === "start")
      return careResponse(await store.create(owner), 201);
    const input = {
      requestId: body.requestId,
      twinId: null,
      revision: 0,
      message: JSON.stringify({
        scope: "customer-studio",
        message: body.message,
      }),
    };
    const prior = await store.claim(body.conversationId, owner, input);
    if (prior) return careResponse(savedCustomerPresentation(prior));
    try {
      let plan: CustomerPlan;
      const allowed = customerRequestAllowed(body.message);
      if (!allowed) {
        plan = validateCustomerPlan({ outcome: "unsupported", commands: [] });
      } else {
        const signal = AbortSignal.any([
          request.signal,
          AbortSignal.timeout(MODEL_TIMEOUT_MS),
        ]);
        const data = await getCustomerIntelligence();
        if (signal.aborted) throw new CareError("customer_dashboard_cancelled");
        const subscription = config.mode === "subscription";
        const reservation = !subscription
          ? await store.reserve(body.conversationId, owner, body.requestId)
          : null;
        const work = () =>
          planCustomerDashboard(
            config.mode === "responses"
              ? new ResponsesProvider(config)
              : new SubscriptionProvider({
                  scope: "studio",
                  requestId: body.requestId,
                  ownerProof,
                }),
            body.message,
            data,
            signal,
          );
        const raw = subscription
          ? (await work()).value
          : await accountedCall(work, (micro, usage) =>
              store.settle(
                body.conversationId,
                owner,
                body.requestId,
                reservation!,
                micro,
                usage,
              ),
            );
        // Validate after accounting: even a rejected result must retain known
        // billed usage, and an unknown result must retain its reservation.
        plan = validateCustomerPlan(raw);
        if (signal.aborted) throw new CareError("customer_dashboard_cancelled");
      }
      await store.finish(body.conversationId, owner, {
        requestId: body.requestId,
        message: input.message,
        answer: {
          outcome: plan.outcome === "apply" ? "answered" : "unsupported",
          mode: allowed ? "live" : "deterministic",
          context: null,
          revision: 0,
          text: "Validated customer presentation-only plan; no financial action.",
          steps: [],
          sources: [],
          actions: [],
          customerPresentation: plan,
        },
      });
      return careResponse(plan);
    } catch (error) {
      // Terminal failure releases only the conversation lease. No reservation,
      // subscription journal entry, consumed quota or original key is reset.
      await store.finish(
        body.conversationId,
        owner,
        unavailableCustomerPresentationTurn(body.requestId, input.message),
      );
      throw error;
    }
  } catch (error) {
    return careError(error);
  }
}
