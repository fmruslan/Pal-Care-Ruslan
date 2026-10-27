import {
  createAiHarness,
  createAiToolContext,
  type AgStudioApi,
  type AgAiAgentRunner,
} from "ag-studio";
import {
  operations,
  scriptedCommand,
  scriptedPrompts,
  type DashboardCommand,
  validateDashboardPlan,
  presentationRequestAllowed,
} from "@/lib/intelligence/commands";

export function dashboardHarness(
  api: AgStudioApi,
  apply: (command: DashboardCommand) => void,
  plan?: (message: string, signal: AbortSignal) => Promise<unknown>,
) {
  const presentation = api.defineAiTool({
    name: "care_dashboard",
    description:
      "Apply one allowlisted browser-only presentation command. No commerce or provider authority.",
    params: (s) => s.object({ operation: s.enum(operations) }),
    execute: (command, ctx) => {
      if (ctx.signal.aborted)
        return ctx.error("Cancelled; no command applied.");
      apply(command);
      return ctx.success(
        `Applied ${command.operation} to this browser's dashboard only. ${plan ? "Model-planned presentation; no commerce authority." : "Scripted demonstration; no live AI or provider calls."}`,
      );
    },
  });
  const agent: AgAiAgentRunner = {
    id: plan ? "care-sol" : "care-scripted",
    name: plan ? "CareOS · Sol Medium" : "CareOS · scripted demo",
    description: plan
      ? "Sol interprets requests; validated Studio tools change browser presentation only."
      : "Deterministic demonstration with real Studio tools, not live AI.",
    tools: ({ studio }) => [studio.viewSchema(), presentation],
    run: async function* (input, ctx) {
      yield {
        type: "RUN_STARTED",
        threadId: input.threadId,
        runId: input.runId,
      };
      const last = input.messages.filter((m) => m.role === "user").at(-1);
      const message = typeof last?.content === "string" ? last.content : "";
      let commands: DashboardCommand[] = [];
      try {
        if (plan) {
          if (presentationRequestAllowed(message))
            commands = validateDashboardPlan(
              await plan(message, ctx.signal ?? new AbortController().signal),
            ).commands;
        } else {
          const command = scriptedCommand(message);
          if (command) commands = [command];
        }
      } catch {
        yield {
          type: "RUN_ERROR",
          message:
            "Model plan unavailable, cancelled or invalid. No presentation command was applied. No automatic retry.",
        };
        return;
      }
      let text = plan
        ? "That request cannot be applied with the permitted presentation tools. Financial actions are unavailable."
        : "Scripted demo only. Choose a supported prompt; arbitrary requests and financial actions are not available.";
      if (commands.length) {
        // One schema tool + at most three validated presentation tools, no autonomous loop.
        for (const [tool, args] of [
          [ctx.tools()[0], {}],
          ...commands.map((command) => [presentation, command] as const),
        ] as const) {
          if (ctx.signal?.aborted) return;
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
              signal: ctx.signal,
              run: { threadId: input.threadId, runId: input.runId },
            }),
          );
          if (!result?.success) {
            yield {
              type: "RUN_ERROR",
              message: "Dashboard command could not be applied safely.",
            };
            return;
          }
          yield {
            type: "TOOL_CALL_RESULT",
            messageId: `result-${id}`,
            toolCallId: id,
            content: result.response,
          };
        }
        text = plan
          ? `Sol Medium planned: ${commands.map((c) => c.operation).join(", ")}. Applied with real Studio tools in this browser only. No financial action.`
          : `Scripted command applied: ${commands[0].operation}. Real Studio schema/presentation tools were used. No live model, financial action or external provider request.`;
      }
      const id = crypto.randomUUID();
      yield { type: "TEXT_MESSAGE_START", messageId: id, role: "assistant" };
      yield { type: "TEXT_MESSAGE_CONTENT", messageId: id, delta: text };
      yield { type: "TEXT_MESSAGE_END", messageId: id };
      yield {
        type: "RUN_FINISHED",
        threadId: input.threadId,
        runId: input.runId,
      };
    },
  };
  return createAiHarness(api, () => ({
    agents: [agent],
    primary: agent.id,
    promptStarters: scriptedPrompts.map(([prompt]) => ({
      label: prompt,
      prompt,
    })),
  }));
}
