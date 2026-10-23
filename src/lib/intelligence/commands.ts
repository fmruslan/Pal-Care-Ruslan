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
