import { z } from "zod";
export const operations = [
  "proposed",
  "pending",
  "verified",
  "add-summary",
  "evidence",
  "reset",
] as const;
export const dashboardCommandSchema = z.strictObject({
  operation: z.enum(operations),
});
export type DashboardCommand = z.infer<typeof dashboardCommandSchema>;
export const dashboardPlanSchema = z.strictObject({
  outcome: z.enum(["apply", "unsupported"]),
  commands: z.array(dashboardCommandSchema).max(3),
});
export type DashboardPlan = z.infer<typeof dashboardPlanSchema>;
export function validateDashboardPlan(raw: unknown): DashboardPlan {
  const plan = dashboardPlanSchema.parse(raw);
  if (
    (plan.outcome === "apply") !== plan.commands.length > 0 ||
    new Set(plan.commands.map((c) => c.operation)).size !== plan.commands.length
  )
    throw new Error("dashboard_plan_invalid");
  return plan;
}
export function presentationRequestAllowed(message: string) {
  return (
    message.length <= 500 &&
    !/\b(approve|execute|issue|send|capture|pay|delete|insert|update|drop|sql|password|secret|api.?key)\b|ignore.*(rules|instructions)|https?:/i.test(
      message,
    )
  );
}
export const scriptedPrompts = [
  ["Show adjustments awaiting approval", "proposed"],
  ["Show pending refunds", "pending"],
  ["Show verified refunds", "verified"],
  ["Add a verified-refund summary", "add-summary"],
  ["Show the evidence", "evidence"],
  ["Reset this dashboard", "reset"],
] as const;
// Deliberately exact scripted grammar. Not a model, autonomous agent or intent confidence score.
export function scriptedCommand(message: string): DashboardCommand | null {
  if (message.length > 500) return null;
  const match = scriptedPrompts.find(
    ([prompt]) => prompt.toLowerCase() === message.trim().toLowerCase(),
  );
  return match ? { operation: match[1] } : null;
}
// Future authorized planners produce this same narrow command; they never receive a DB/financial tool.
export interface DashboardPlanner {
  plan(message: string, signal: AbortSignal): Promise<unknown>;
}
export async function plannedCommand(
  planner: DashboardPlanner,
  message: string,
  signal: AbortSignal,
) {
  if (message.length > 500 || signal.aborted)
    throw new Error("dashboard_request_blocked");
  const result = await planner.plan(message, signal);
  if (signal.aborted) throw new Error("dashboard_cancelled");
  return dashboardCommandSchema.parse(result);
}
