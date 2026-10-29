import {
  createAiHarness,
  createAiToolContext,
  type AgAiAgentRunner,
  type AgStudioApi,
  type AgAiChatSession,
} from "ag-studio";
import {
  customerCommandSchema,
  validateCustomerPlan,
  orderedCustomerCommands,
  type CustomerPlan,
  type CustomerCommand,
} from "@/lib/intelligence/customer-commands";
import { customerPageHealthy } from "@/lib/intelligence/customer-health";
import { stateFingerprint } from "@/lib/intelligence/customer-observation";

/** The official custom runner executes tools, not merely telemetry claiming they ran. */
export async function executeCustomerAgent(
  api: AgStudioApi,
  raw: CustomerPlan,
  apply: (
    command: CustomerCommand,
    signal: AbortSignal,
  ) => Promise<{ empty: boolean; nativeReady: boolean }>,
  signal: AbortSignal,
): Promise<string[]> {
  const plan = validateCustomerPlan(raw);
  let verifiedEmpty = false;
  let nativeCompleted = false;
  if (signal.aborted) throw new Error("insights_cancelled");
  if (plan.outcome !== "apply") return [];
  let session: AgAiChatSession | undefined;
  let finish!: (value: string[]) => void;
  let fail!: (reason: Error) => void;
  const completed = new Promise<string[]>((resolve, reject) => {
    finish = resolve;
    fail = reject;
  });
  const presentation = api.defineAiTool({
    name: "personal_purchase_view",
    description:
      "Change an allowlisted customer view and verify the resulting SDK state. No payment or merchant authority.",
    params: (s) => s.object({ command: s.string() }),
    execute: async ({ command }, ctx) => {
      if (signal.aborted || ctx.signal.aborted)
        return ctx.error("Request stopped.");
      const result = await apply(
        customerCommandSchema.parse(JSON.parse(command)),
        signal,
      );
      verifiedEmpty = result.empty;
      nativeCompleted = result.nativeReady;
      return ctx.success(
        "Presentation state checked after applying the permitted command.",
      );
    },
  });
  const runner: AgAiAgentRunner = {
    id: "personal-careos",
    name: "CareOS · Personal Insights",
    tools: ({ studio }) => [
      studio.viewSchema(),
      studio.viewPage(),
      presentation,
    ],
    run: async function* (input, ctx) {
      const names: string[] = [];
      yield {
        type: "RUN_STARTED",
        runId: input.runId,
        threadId: input.threadId,
      };
      try {
        const tools = ctx.tools();
        let checkpoint = stateFingerprint(api.getState());
        const calls = [
          { tool: tools[0], args: {} },
          { tool: tools[1], args: {} },
          ...orderedCustomerCommands(plan).map((command) => ({
            tool: presentation,
            args: { command: JSON.stringify(command) },
          })),
          { tool: tools[1], args: {} },
        ];
        for (const [index, { tool, args }] of calls.entries()) {
          if (signal.aborted || ctx.signal?.aborted)
            throw new Error("insights_cancelled");
          if (stateFingerprint(api.getState()) !== checkpoint)
            throw new Error("insights_view_changed_during_execution");
          const id = crypto.randomUUID();
          yield {
            type: "TOOL_CALL_START",
            toolCallId: id,
            toolCallName: tool.name,
          };
          yield {
            type: "TOOL_CALL_ARGS",
            toolCallId: id,
            delta: JSON.stringify(args),
          };
          yield { type: "TOOL_CALL_END", toolCallId: id };
          const result = await tool.execute?.(
            { toolCallId: id, name: tool.name, args },
            createAiToolContext({
              signal,
              run: { threadId: input.threadId, runId: input.runId },
            }),
          );
          if (!result?.success) throw new Error("insights_tool_failed");
          if (tool === presentation)
            checkpoint = stateFingerprint(api.getState());
          else if (stateFingerprint(api.getState()) !== checkpoint)
            throw new Error("insights_view_changed_during_execution");
          if (
            index === calls.length - 1 &&
            !customerPageHealthy(result.data, verifiedEmpty, nativeCompleted)
          ) {
            throw new Error("insights_dashboard_health_unverified");
          }
          names.push(tool.name);
          yield {
            type: "TOOL_CALL_RESULT",
            messageId: `result-${id}`,
            toolCallId: id,
            content: result.response,
          };
        }
        yield {
          type: "RUN_FINISHED",
          runId: input.runId,
          threadId: input.threadId,
        };
        finish(names);
      } catch (error) {
        yield {
          type: "RUN_ERROR",
          message: "The dashboard change could not be verified.",
        };
        fail(
          error instanceof Error && /^insights_[a-z_]+$/.test(error.message)
            ? error
            : new Error("insights_execution_unverified"),
        );
      }
    },
  };
  const harness = createAiHarness(api, () => ({
    agents: [runner],
    primary: runner.id,
  }));
  const abort = () => {
    session?.cancel();
    fail(new Error("insights_cancelled"));
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    session = await harness.createThread({ agentId: runner.id });
    if (signal.aborted) throw new Error("insights_cancelled");
    session.sendMessage("Apply the validated personal purchase view.");
    return await completed;
  } finally {
    signal.removeEventListener("abort", abort);
    session?.close();
    harness.dispose?.();
  }
}
